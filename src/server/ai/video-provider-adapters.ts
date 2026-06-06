import type { ResolvedVideoModel } from '@/server/repositories/ai-models';
import {
  ProviderConfigurationError,
  ProviderRequestError,
} from './provider-adapters';
import {
  proxyRequestInit,
  selectOpenAiCompatibleFetch,
  type RequestInitWithDispatcher,
} from './openai-compatible-transport';
import { readSafeProviderErrorBody } from './provider-error-body';

type FetchLike = typeof fetch;
type ReadEnv = (key: string) => string | undefined | null;

type VideoTaskContentEntry =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: { url: string };
    }
  | {
      type: 'audio_url';
      audio_url: { url: string };
    };

export type VideoProviderCreateRequest = {
  runId: string;
  userId: string;
  model: ResolvedVideoModel;
  prompt: string;
  duration?: number;
  resolution?: string;
  imageUrl?: string;
  audioUrl?: string;
  ratio?: string;
  seed?: number;
  watermark?: boolean;
};

export type VideoTaskCreatedResult = {
  providerTaskId: string;
  rawMetadata: Record<string, unknown>;
};

export type VideoProviderStatusRequest = {
  runId: string;
  userId: string;
  model: ResolvedVideoModel;
  providerTaskId: string;
};

export type VideoTaskStatusResult = {
  providerTaskId: string;
  status: 'running' | 'succeeded' | 'failed';
  outputUrl?: string;
  rawMetadata: Record<string, unknown>;
  errorMessage?: string;
};

export function createDoubaoVideoTaskAdapter(input: {
  fetch?: FetchLike;
  readEnv?: ReadEnv;
} = {}) {
  const fetchImpl = input.fetch ?? selectOpenAiCompatibleFetch();
  const readEnv = input.readEnv ?? ((key) => process.env[key]);

  return {
    async createVideoTask(request: VideoProviderCreateRequest): Promise<VideoTaskCreatedResult> {
      const { apiKey, baseUrl } = resolveProviderCredentials(request.model, readEnv);
      const endpoint = createTaskEndpoint(baseUrl);

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(createVideoTaskBody(request)),
          ...proxyRequestInit(),
        } satisfies RequestInitWithDispatcher);
      } catch (error) {
        throw new ProviderRequestError(`Provider request failed: ${toErrorMessage(error)}`);
      }

      if (!response.ok) {
        throw new ProviderRequestError(
          `Provider request failed with status ${response.status}: ${await readSafeProviderErrorBody(response)}`,
        );
      }

      const raw = await readJsonResponse(response);
      const taskId = readTaskId(raw);
      if (!taskId) {
        throw new ProviderRequestError('Provider response did not include a video task id.');
      }

      return {
        providerTaskId: taskId,
        rawMetadata: isRecord(raw) ? raw : {},
      };
    },

    async getVideoTask(request: VideoProviderStatusRequest): Promise<VideoTaskStatusResult> {
      const { apiKey, baseUrl } = resolveProviderCredentials(request.model, readEnv);
      const endpoint = createTaskStatusEndpoint(baseUrl, request.providerTaskId);

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'GET',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          ...proxyRequestInit(),
        } satisfies RequestInitWithDispatcher);
      } catch (error) {
        throw new ProviderRequestError(`Provider request failed: ${toErrorMessage(error)}`);
      }

      if (!response.ok) {
        throw new ProviderRequestError(
          `Provider request failed with status ${response.status}: ${await readSafeProviderErrorBody(response)}`,
        );
      }

      const raw = await readJsonResponse(response);
      if (!isRecord(raw)) {
        throw new ProviderRequestError('Provider returned an invalid video task response.');
      }

      const status = normalizeVideoTaskStatus(raw.status);
      const errorMessage = readTaskErrorMessage(raw);
      const outputUrl = readVideoUrl(raw);

      return {
        providerTaskId: request.providerTaskId,
        status,
        outputUrl: status === 'succeeded' ? outputUrl ?? undefined : undefined,
        rawMetadata: raw,
        ...(errorMessage ? { errorMessage } : {}),
      };
    },
  };
}

function resolveProviderCredentials(model: ResolvedVideoModel, readEnv: ReadEnv) {
  const baseUrl = model.baseUrl?.trim();
  const credentialEnvKey = model.credentialEnvKey?.trim();
  if (!baseUrl || !credentialEnvKey) {
    throw new ProviderConfigurationError('Doubao video provider is missing configuration.');
  }

  const apiKey = readEnv(credentialEnvKey)?.trim();
  if (!apiKey) {
    throw new ProviderConfigurationError(
      `Doubao video provider credential is missing: ${credentialEnvKey}`,
    );
  }

  return { apiKey, baseUrl };
}

function createVideoTaskBody(request: VideoProviderCreateRequest): Record<string, unknown> {
  const suffix: string[] = [];
  if (request.resolution) suffix.push(`--rs ${request.resolution}`);
  if (request.ratio) suffix.push(`--rt ${request.ratio}`);
  if (typeof request.duration === 'number') suffix.push(`--dur ${request.duration}`);
  if (typeof request.seed === 'number') suffix.push(`--seed ${request.seed}`);
  if (typeof request.watermark === 'boolean') suffix.push(`--wm ${request.watermark}`);

  const text = suffix.length > 0 ? `${request.prompt} ${suffix.join(' ')}` : request.prompt;
  const content: VideoTaskContentEntry[] = [
    {
      type: 'text',
      text,
    },
  ];

  if (request.imageUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: request.imageUrl },
    });
  }

  if (request.audioUrl) {
    content.push({
      type: 'audio_url',
      audio_url: { url: request.audioUrl },
    });
  }

  return {
    model: request.model.model,
    content,
  };
}

function readTaskId(raw: unknown) {
  return isRecord(raw) && typeof raw.id === 'string' ? raw.id : null;
}

function readTaskErrorMessage(raw: Record<string, unknown>) {
  if (typeof raw.error === 'string') {
    return raw.error;
  }
  if (isRecord(raw.error) && typeof raw.error.message === 'string') {
    return raw.error.message;
  }
  return null;
}

function readVideoUrl(raw: Record<string, unknown>) {
  if (!isRecord(raw.content)) {
    return null;
  }
  return typeof raw.content.video_url === 'string' ? raw.content.video_url : null;
}

function normalizeVideoTaskStatus(rawStatus: unknown): 'running' | 'succeeded' | 'failed' {
  if (rawStatus === 'succeeded' || rawStatus === 'done' || rawStatus === 'completed') {
    return 'succeeded';
  }
  if (rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'cancelled') {
    return 'failed';
  }
  return 'running';
}

function createTaskEndpoint(baseUrl: string) {
  try {
    return new URL('contents/generations/tasks', ensureTrailingSlash(baseUrl));
  } catch {
    throw new ProviderConfigurationError('Doubao video provider has invalid base URL.');
  }
}

function createTaskStatusEndpoint(baseUrl: string, providerTaskId: string) {
  try {
    return new URL(`contents/generations/tasks/${providerTaskId}`, ensureTrailingSlash(baseUrl));
  } catch {
    throw new ProviderConfigurationError('Doubao video provider has invalid base URL.');
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

async function readJsonResponse(response: Response) {
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw new ProviderRequestError(`Provider returned unreadable response body: ${toErrorMessage(error)}`);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    throw new ProviderRequestError(`Provider returned invalid JSON: ${toErrorMessage(error)}`);
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
