import { ProxyAgent, fetch as undiciFetch } from 'undici';

import type { AiUsage } from '@/server/agent/types';
import type { ResolvedChatModel } from '@/server/repositories/ai-models';

export type ChatProviderMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatProviderRequest = {
  runId: string;
  userId: string;
  model: ResolvedChatModel;
  messages: ChatProviderMessage[];
};

export type ChatProviderResult = {
  finalMessage: string;
  usage: AiUsage;
  rawMetadata: Record<string, unknown>;
};

export type ChatProviderStreamEvent =
  | {
      type: 'delta';
      delta: string;
    }
  | {
      type: 'final';
      finalMessage: string;
      usage: AiUsage;
      rawMetadata: Record<string, unknown>;
    };

export type ChatProviderStreamRequest = ChatProviderRequest;

export type ChatProviderAdapter = {
  kind: ResolvedChatModel['providerType'];
  runChat(request: ChatProviderRequest): Promise<ChatProviderResult>;
  streamChat?(request: ChatProviderStreamRequest): AsyncGenerator<ChatProviderStreamEvent, void, void>;
};

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}

export class ProviderRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

type FetchLike = typeof fetch;
type RequestInitWithDispatcher = RequestInit & {
  dispatcher?: ProxyAgent;
};

let cachedProxyConfig: { url: string; agent: ProxyAgent } | null = null;

function estimateTokensFromText(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function estimateChatUsage(input: {
  messages: ChatProviderMessage[];
  finalMessage: string;
}): AiUsage {
  const promptTokens = Math.max(
    1,
    input.messages.reduce((total, message) => total + estimateTokensFromText(message.content), 0),
  );
  const completionTokens = estimateTokensFromText(input.finalMessage);

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export function createDevelopmentChatProviderAdapter(): ChatProviderAdapter {
  return {
    kind: 'development',
    async runChat(request) {
      const userPrompt =
        request.messages.findLast((message) => message.role === 'user')?.content ?? '';
      const finalMessage = `Development response from ${request.model.name}: ${userPrompt}`;

      return {
        finalMessage,
        usage: estimateChatUsage({ messages: request.messages, finalMessage }),
        rawMetadata: { developmentFallback: true },
      };
    },
    async *streamChat(request) {
      const userPrompt =
        request.messages.findLast((message) => message.role === 'user')?.content ?? '';
      const finalMessage = `Development response from ${request.model.name}: ${userPrompt}`;
      yield { type: 'delta', delta: finalMessage };
      yield {
        type: 'final',
        finalMessage,
        usage: estimateChatUsage({ messages: request.messages, finalMessage }),
        rawMetadata: { developmentFallback: true },
      };
    },
  };
}

export function createOpenAiCompatibleChatProviderAdapter(input: {
  fetch?: FetchLike;
} = {}): ChatProviderAdapter {
  const fetchImpl = input.fetch ?? selectOpenAiCompatibleFetch();

  return {
    kind: 'openai_compatible',
    async runChat(request) {
      const baseUrl = request.model.baseUrl?.trim();
      const credentialEnvKey = request.model.credentialEnvKey?.trim();
      if (!baseUrl || !credentialEnvKey) {
        throw new ProviderConfigurationError('OpenAI-compatible provider is missing configuration.');
      }

      const apiKey = process.env[credentialEnvKey];
      if (!apiKey) {
        throw new ProviderConfigurationError(
          `OpenAI-compatible provider credential is missing: ${credentialEnvKey}`,
        );
      }

      let response: Response;
      try {
        response = await fetchImpl(new URL('chat/completions', ensureTrailingSlash(baseUrl)), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model.model,
            messages: request.messages,
          }),
          ...proxyRequestInit(),
        } satisfies RequestInitWithDispatcher);
      } catch (error) {
        throw new ProviderRequestError(`Provider request failed: ${toErrorMessage(error)}`);
      }

      if (!response.ok) {
        throw new ProviderRequestError(
          `Provider request failed with status ${response.status}: ${await readSafeErrorBody(response)}`,
        );
      }

      const raw = await readJsonResponse(response);
      return parseOpenAiCompatibleResponse(raw, request.messages);
    },
    async *streamChat(request) {
      const baseUrl = request.model.baseUrl?.trim();
      const credentialEnvKey = request.model.credentialEnvKey?.trim();
      if (!baseUrl || !credentialEnvKey) {
        throw new ProviderConfigurationError('OpenAI-compatible provider is missing configuration.');
      }

      const apiKey = process.env[credentialEnvKey];
      if (!apiKey) {
        throw new ProviderConfigurationError(
          `OpenAI-compatible provider credential is missing: ${credentialEnvKey}`,
        );
      }

      let response: Response;
      try {
        response = await fetchImpl(new URL('chat/completions', ensureTrailingSlash(baseUrl)), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model.model,
            messages: request.messages,
            stream: true,
          }),
          ...proxyRequestInit(),
        } satisfies RequestInitWithDispatcher);
      } catch (error) {
        throw new ProviderRequestError(`Provider request failed: ${toErrorMessage(error)}`);
      }

      if (!response.ok) {
        throw new ProviderRequestError(
          `Provider request failed with status ${response.status}: ${await readSafeErrorBody(response)}`,
        );
      }

      const raw = await readJsonResponse(response);
      const parsed = parseOpenAiCompatibleResponse(raw, request.messages);
      yield { type: 'delta', delta: parsed.finalMessage };
      yield { type: 'final', ...parsed };
    },
  };
}

export function createChatProviderAdapter(model: ResolvedChatModel): ChatProviderAdapter {
  if (model.providerType === 'openai_compatible') {
    return createOpenAiCompatibleChatProviderAdapter();
  }

  return createDevelopmentChatProviderAdapter();
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function proxyRequestInit(): Pick<RequestInitWithDispatcher, 'dispatcher'> {
  const proxyUrl = process.env.STYX_OPENAI_COMPAT_PROXY_URL?.trim();
  if (!proxyUrl) {
    return {};
  }

  if (!cachedProxyConfig || cachedProxyConfig.url !== proxyUrl) {
    cachedProxyConfig = {
      url: proxyUrl,
      agent: new ProxyAgent(proxyUrl),
    };
  }

  return { dispatcher: cachedProxyConfig.agent };
}

function selectOpenAiCompatibleFetch(): FetchLike {
  return process.env.STYX_OPENAI_COMPAT_PROXY_URL?.trim()
    ? (undiciFetch as unknown as FetchLike)
    : fetch;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function readSafeErrorBody(response: Response) {
  try {
    const body = await response.text();
    return body.trim().slice(0, 500) || 'empty response body';
  } catch {
    return 'unreadable response body';
  }
}

async function readJsonResponse(response: Response) {
  const body = await readResponseText(response);

  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    const ssePayload = parseSseJsonPayload(body);
    if (ssePayload !== null) {
      return ssePayload;
    }

    throw new ProviderRequestError(`Provider returned invalid JSON: ${toErrorMessage(error)}`);
  }
}

async function readResponseText(response: Response) {
  try {
    return await response.text();
  } catch (error) {
    throw new ProviderRequestError(`Provider returned unreadable response body: ${toErrorMessage(error)}`);
  }
}

function parseSseJsonPayload(body: string): unknown | null {
  const payloads = body
    .split(/\r?\n\r?\n/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n'),
    )
    .filter((payload) => payload.length > 0 && payload !== '[DONE]');

  const parsedEvents: unknown[] = [];
  for (const payload of payloads) {
    try {
      parsedEvents.push(JSON.parse(payload) as unknown);
    } catch {
      continue;
    }
  }

  if (parsedEvents.length === 0) {
    return null;
  }

  const streamed = combineSseDeltaEvents(parsedEvents);
  if (streamed) {
    return streamed;
  }

  return parsedEvents.at(-1) ?? null;
}

function combineSseDeltaEvents(events: unknown[]): Record<string, unknown> | null {
  let content = '';
  let usage: unknown = null;
  let lastRecord: Record<string, unknown> | null = null;

  for (const event of events) {
    if (!isRecord(event)) {
      continue;
    }

    lastRecord = event;
    if (isRecord(event.usage)) {
      usage = event.usage;
    }

    const choices = Array.isArray(event.choices) ? event.choices : [];
    for (const choice of choices) {
      if (!isRecord(choice)) {
        continue;
      }

      const delta = isRecord(choice.delta) ? choice.delta : null;
      const deltaContent = delta?.content;
      if (typeof deltaContent === 'string') {
        content += deltaContent;
      }

      const message = isRecord(choice.message) ? choice.message : null;
      const messageContent = message?.content;
      if (!content && typeof messageContent === 'string') {
        content = messageContent;
      }
    }
  }

  if (!content) {
    return null;
  }

  return {
    ...(lastRecord ?? {}),
    choices: [{ message: { role: 'assistant', content } }],
    ...(usage ? { usage } : {}),
    streamEvents: events,
  };
}

function parseOpenAiCompatibleResponse(
  raw: unknown,
  messages: ChatProviderMessage[],
): ChatProviderResult {
  if (!isRecord(raw)) {
    throw new ProviderRequestError('Provider returned an invalid response.');
  }

  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
  const content = message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new ProviderRequestError('Provider response did not include an assistant message.');
  }

  return {
    finalMessage: content,
    usage: parseUsage(raw.usage, messages, content),
    rawMetadata: raw,
  };
}

function parseUsage(rawUsage: unknown, messages: ChatProviderMessage[], finalMessage: string): AiUsage {
  if (isRecord(rawUsage)) {
    const promptTokens = readNonNegativeInteger(rawUsage.prompt_tokens);
    const completionTokens = readNonNegativeInteger(rawUsage.completion_tokens);
    const totalTokens = readNonNegativeInteger(rawUsage.total_tokens);

    if (promptTokens !== null && completionTokens !== null) {
      return {
        promptTokens,
        completionTokens,
        totalTokens: totalTokens ?? promptTokens + completionTokens,
      };
    }
  }

  return estimateChatUsage({ messages, finalMessage });
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
