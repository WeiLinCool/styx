import { randomUUID } from 'node:crypto';

import {
  createChatProviderAdapter,
  ProviderConfigurationError,
  ProviderRequestError,
  type ChatProviderAdapter,
  type ChatProviderMessage,
  type ChatProviderStreamEvent,
} from '@/server/ai/provider-adapters';
import type { AiUsage } from '@/server/agent/types';
import {
  hasEnterpriseEntitlement,
  resolveEnterpriseEntitlements,
  type EnterpriseEntitlementsResponse,
} from '@/server/enterprise/entitlements';
import {
  listAvailableChatModelsForUser,
  listAvailableImageModelsForUser,
  listAvailableVideoModelsForUser,
  ModelEntitlementRequiredError,
  ModelNotAvailableError,
  resolveChatModelForUser,
  type PublicImageModelDto,
  type PublicVideoModelDto,
  type PublicChatModelDto,
  type ResolvedChatModel,
} from '@/server/repositories/ai-models';

export class EnterpriseGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'EnterpriseGatewayError';
  }
}

export type OpenAiChatCompletionRequest = {
  model: string;
  messages: ChatProviderMessage[];
  stream?: boolean;
};

type OpenAiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type EnterpriseGatewayDeps = {
  resolveEnterpriseEntitlements?: (userId: string) => Promise<EnterpriseEntitlementsResponse>;
  listAvailableChatModelsForUser?: (userId: string) => Promise<PublicChatModelDto[]>;
  listAvailableImageModelsForUser?: (
    userId: string,
    mode: 'generate' | 'edit' | 'upscale',
  ) => Promise<PublicImageModelDto[]>;
  listAvailableVideoModelsForUser?: (userId: string) => Promise<PublicVideoModelDto[]>;
  resolveChatModelForUser?: (userId: string, modelId: string) => Promise<ResolvedChatModel>;
  createChatProviderAdapter?: (model: ResolvedChatModel) => ChatProviderAdapter;
  now?: () => Date;
  createId?: () => string;
};

const defaultDeps = {
  resolveEnterpriseEntitlements,
  listAvailableChatModelsForUser,
  listAvailableImageModelsForUser,
  listAvailableVideoModelsForUser,
  resolveChatModelForUser,
  createChatProviderAdapter,
  now: () => new Date(),
  createId: () => `chatcmpl-${randomUUID()}`,
};

export function toOpenAiModelList(models: PublicChatModelDto[]) {
  const uniqueModels = new Map<string, PublicChatModelDto>();
  for (const model of models) {
    uniqueModels.set(openAiModelId(model), model);
  }

  return {
    object: 'list',
    data: Array.from(uniqueModels.values()).map((model) => ({
      id: openAiModelId(model),
      object: 'model',
      owned_by: 'enterprise',
    })),
  };
}

function openAiModelId(model: PublicChatModelDto) {
  return model.model?.trim() || model.code || model.id;
}

export function parseOpenAiChatCompletionBody(body: unknown): OpenAiChatCompletionRequest {
  if (!isRecord(body)) {
    throw new EnterpriseGatewayError('invalid_request', 'Request body must be a JSON object.', 400);
  }

  if (typeof body.model !== 'string' || body.model.trim().length === 0) {
    throw new EnterpriseGatewayError('invalid_request', 'Request body requires a model string.', 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new EnterpriseGatewayError('invalid_request', 'Request body requires messages.', 400);
  }

  const messages = body.messages.map(parseMessage);
  const stream = typeof body.stream === 'boolean' ? body.stream : undefined;

  return {
    model: body.model,
    messages,
    ...(stream !== undefined ? { stream } : {}),
  };
}

function parseMessage(message: unknown): ChatProviderMessage {
  if (!isRecord(message)) {
    throw new EnterpriseGatewayError('invalid_request', 'Each message must be an object.', 400);
  }

  if (
    message.role !== 'user' &&
    message.role !== 'assistant' &&
    message.role !== 'system'
  ) {
    throw new EnterpriseGatewayError('invalid_request', 'Each message requires a supported role.', 400);
  }

  if (typeof message.content !== 'string') {
    throw new EnterpriseGatewayError('invalid_request', 'Each message requires string content.', 400);
  }

  return {
    role: message.role,
    content: message.content,
  };
}

export async function requireEnterpriseModelProxy(
  userId: string,
  deps: EnterpriseGatewayDeps = {},
) {
  const resolvedDeps = resolveDeps(deps);
  const entitlements = await resolvedDeps.resolveEnterpriseEntitlements(userId);

  if (!hasEnterpriseEntitlement(entitlements.entitlements, 'models:proxy')) {
    throw new EnterpriseGatewayError(
      'insufficient_entitlement',
      'Enterprise model proxy entitlement is required.',
      403,
    );
  }

  return entitlements;
}

export async function listEnterpriseOpenAiModels(
  userId: string,
  deps: EnterpriseGatewayDeps = {},
) {
  const resolvedDeps = resolveDeps(deps);
  await requireEnterpriseModelProxy(userId, resolvedDeps);
  const [chatModels, imageGenerateModels, imageEditModels, imageUpscaleModels, videoModels] =
    await Promise.all([
      resolvedDeps.listAvailableChatModelsForUser(userId),
      resolvedDeps.listAvailableImageModelsForUser(userId, 'generate'),
      resolvedDeps.listAvailableImageModelsForUser(userId, 'edit'),
      resolvedDeps.listAvailableImageModelsForUser(userId, 'upscale'),
      resolvedDeps.listAvailableVideoModelsForUser(userId),
    ]);

  return toOpenAiModelList([
    ...chatModels,
    ...imageGenerateModels,
    ...imageEditModels,
    ...imageUpscaleModels,
    ...videoModels,
  ]);
}

export async function createEnterpriseChatCompletion(
  input: {
    userId: string;
    request: OpenAiChatCompletionRequest;
  },
  deps: EnterpriseGatewayDeps = {},
) {
  const resolvedDeps = resolveDeps(deps);
  const model = await resolveModel(input.userId, input.request.model, resolvedDeps);
  const adapter = resolvedDeps.createChatProviderAdapter(model);
  let result;
  try {
    result = await adapter.runChat({
      runId: resolvedDeps.createId(),
      userId: input.userId,
      model,
      messages: input.request.messages,
    });
  } catch (error) {
    throw mapProviderError(error);
  }

  return {
    id: resolvedDeps.createId(),
    object: 'chat.completion',
    created: toUnixSeconds(resolvedDeps.now()),
    model: input.request.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: result.finalMessage,
        },
        finish_reason: 'stop',
      },
    ],
    ...(result.usage ? { usage: toOpenAiUsage(result.usage) } : {}),
  };
}

export async function streamEnterpriseChatCompletion(
  input: {
    userId: string;
    request: OpenAiChatCompletionRequest;
  },
  deps: EnterpriseGatewayDeps = {},
) {
  const resolvedDeps = resolveDeps(deps);
  const model = await resolveModel(input.userId, input.request.model, resolvedDeps);
  const adapter = resolvedDeps.createChatProviderAdapter(model);
  const providerEvents = adapter.streamChat
    ? adapter.streamChat({
        runId: resolvedDeps.createId(),
        userId: input.userId,
        model,
        messages: input.request.messages,
      })
    : runChatAsStream(adapter, {
        runId: resolvedDeps.createId(),
        userId: input.userId,
        model,
        messages: input.request.messages,
      });

  return createOpenAiSseStream({
    model: input.request.model,
    events: providerEvents,
    now: resolvedDeps.now,
    createId: resolvedDeps.createId,
  });
}

export function createOpenAiSseStream(input: {
  model: string;
  events: AsyncIterable<ChatProviderStreamEvent>;
  now?: () => Date;
  createId?: () => string;
}) {
  const encoder = new TextEncoder();
  const now = input.now ?? defaultDeps.now;
  const createId = input.createId ?? defaultDeps.createId;
  const id = createId();
  const created = toUnixSeconds(now());

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of input.events) {
          if (event.type !== 'delta' || event.delta.length === 0) {
            continue;
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                id,
                object: 'chat.completion.chunk',
                created,
                model: input.model,
                choices: [
                  {
                    index: 0,
                    delta: { content: event.delta },
                    finish_reason: null,
                  },
                ],
              })}\n\n`,
            ),
          );
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

async function* runChatAsStream(
  adapter: ChatProviderAdapter,
  request: Parameters<ChatProviderAdapter['runChat']>[0],
): AsyncGenerator<ChatProviderStreamEvent, void, void> {
  let result;
  try {
    result = await adapter.runChat(request);
  } catch (error) {
    throw mapProviderError(error);
  }
  yield { type: 'delta', delta: result.finalMessage };
  yield { type: 'final', ...result };
}

async function resolveModel(
  userId: string,
  modelId: string,
  deps: Required<EnterpriseGatewayDeps>,
) {
  try {
    return await deps.resolveChatModelForUser(userId, modelId);
  } catch (error) {
    if (error instanceof EnterpriseGatewayError) {
      throw error;
    }

    if (error instanceof ModelEntitlementRequiredError) {
      throw new EnterpriseGatewayError(
        'model_entitlement_required',
        error.message,
        403,
      );
    }

    if (error instanceof ModelNotAvailableError) {
      throw new EnterpriseGatewayError(
        'model_not_found',
        'Model is not available for this user.',
        404,
      );
    }

    throw new EnterpriseGatewayError(
      'model_not_found',
      'Model is not available for this user.',
      404,
    );
  }
}

function mapProviderError(error: unknown) {
  if (error instanceof EnterpriseGatewayError) {
    return error;
  }

  if (error instanceof ProviderConfigurationError) {
    return new EnterpriseGatewayError('provider_unconfigured', error.message, 503);
  }

  if (error instanceof ProviderRequestError) {
    return new EnterpriseGatewayError('provider_error', error.message, 502);
  }

  return new EnterpriseGatewayError(
    'provider_error',
    'Enterprise model provider request failed.',
    502,
  );
}

function toOpenAiUsage(usage: AiUsage): OpenAiUsage {
  return {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
  };
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function resolveDeps(deps: EnterpriseGatewayDeps): Required<EnterpriseGatewayDeps> {
  return {
    resolveEnterpriseEntitlements:
      deps.resolveEnterpriseEntitlements ?? defaultDeps.resolveEnterpriseEntitlements,
    listAvailableChatModelsForUser:
      deps.listAvailableChatModelsForUser ?? defaultDeps.listAvailableChatModelsForUser,
    listAvailableImageModelsForUser:
      deps.listAvailableImageModelsForUser ?? defaultDeps.listAvailableImageModelsForUser,
    listAvailableVideoModelsForUser:
      deps.listAvailableVideoModelsForUser ?? defaultDeps.listAvailableVideoModelsForUser,
    resolveChatModelForUser: deps.resolveChatModelForUser ?? defaultDeps.resolveChatModelForUser,
    createChatProviderAdapter:
      deps.createChatProviderAdapter ?? defaultDeps.createChatProviderAdapter,
    now: deps.now ?? defaultDeps.now,
    createId: deps.createId ?? defaultDeps.createId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
