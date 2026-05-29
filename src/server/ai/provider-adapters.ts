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

export type ChatProviderAdapter = {
  kind: ResolvedChatModel['providerType'];
  runChat(request: ChatProviderRequest): Promise<ChatProviderResult>;
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
  };
}

export function createOpenAiCompatibleChatProviderAdapter(input: {
  fetch?: FetchLike;
} = {}): ChatProviderAdapter {
  const fetchImpl = input.fetch ?? fetch;

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
        });
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
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new ProviderRequestError(`Provider returned invalid JSON: ${toErrorMessage(error)}`);
  }
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
