import type {
  ImageModelMode,
  ResolvedImageModel,
} from '@/server/repositories/ai-models';
import type { AgentArtifactInput } from '@/server/repositories/agent-runs';
import {
  ProviderConfigurationError,
  ProviderRequestError,
} from './provider-adapters';

export type ImageProviderRequest = {
  runId: string;
  userId: string;
  model: ResolvedImageModel;
  mode: ImageModelMode;
  prompt: string;
  size?: string;
  scale?: string;
  sourceImageDataUrl?: string;
};

export type ImageProviderResult = {
  finalMessage: string;
  artifacts: AgentArtifactInput[];
  rawMetadata: Record<string, unknown>;
};

export type ImageProviderAdapter = {
  kind: ResolvedImageModel['providerType'];
  runImage(request: ImageProviderRequest): Promise<ImageProviderResult>;
};

type FetchLike = typeof fetch;
type ReadEnv = (key: string) => string | undefined | null;

type DoubaoImageParseContext = {
  model: string;
  mode: ImageModelMode;
};

export function createDoubaoImageProviderAdapter(input: {
  fetch?: FetchLike;
  readEnv?: ReadEnv;
} = {}): ImageProviderAdapter {
  const fetchImpl = input.fetch ?? fetch;
  const readEnv = input.readEnv ?? ((key) => process.env[key]);

  return {
    kind: 'openai_compatible',
    async runImage(request) {
      const baseUrl = request.model.baseUrl?.trim();
      const credentialEnvKey = request.model.credentialEnvKey?.trim();
      if (!baseUrl || !credentialEnvKey) {
        throw new ProviderConfigurationError('Doubao image provider is missing configuration.');
      }

      const apiKey = readEnv(credentialEnvKey)?.trim();
      if (!apiKey) {
        throw new ProviderConfigurationError(
          `Doubao image provider credential is missing: ${credentialEnvKey}`,
        );
      }

      let response: Response;
      try {
        response = await fetchImpl(new URL('images/generations', ensureTrailingSlash(baseUrl)), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(createDoubaoImageRequestBody(request)),
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
      return parseDoubaoImageResponse(raw, {
        model: request.model.model,
        mode: request.mode,
      });
    },
  };
}

export function parseDoubaoImageResponse(
  raw: unknown,
  context: DoubaoImageParseContext,
): ImageProviderResult {
  if (!isRecord(raw)) {
    throw new ProviderRequestError('Provider returned an invalid image response.');
  }

  const artifacts = parseImageArtifacts(raw.data, context);
  if (artifacts.length === 0) {
    throw new ProviderRequestError('Provider response did not include image output.');
  }

  return {
    finalMessage: `Generated ${artifacts.length} ${artifacts.length === 1 ? 'image' : 'images'}.`,
    artifacts,
    rawMetadata: safeDoubaoMetadata(raw),
  };
}

function createDoubaoImageRequestBody(request: ImageProviderRequest): Record<string, unknown> {
  return {
    model: request.model.model,
    prompt: request.prompt,
    ...(request.size ? { size: request.size } : {}),
    ...(request.scale ? { scale: request.scale } : {}),
    response_format: 'b64_json',
    ...(request.sourceImageDataUrl && request.mode !== 'generate'
      ? {
          image: request.sourceImageDataUrl,
          sourceImageDataUrl: request.sourceImageDataUrl,
        }
      : {}),
  };
}

function parseImageArtifacts(
  rawData: unknown,
  context: DoubaoImageParseContext,
): AgentArtifactInput[] {
  if (!Array.isArray(rawData)) {
    return [];
  }

  const artifacts: AgentArtifactInput[] = [];

  rawData.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }

    const revisedPrompt = typeof item.revised_prompt === 'string' ? item.revised_prompt : null;
    const commonMetadata = {
      mimeType: 'image/png',
      model: context.model,
      mode: context.mode,
      ...(revisedPrompt ? { revisedPrompt } : {}),
    };

    if (typeof item.b64_json === 'string' && item.b64_json.length > 0) {
      artifacts.push({
        kind: 'image',
        title: imageTitle(index),
        body: `data:image/png;base64,${item.b64_json}`,
        metadata: commonMetadata,
      });
      return;
    }

    if (typeof item.url === 'string' && item.url.length > 0) {
      artifacts.push({
        kind: 'image',
        title: imageTitle(index),
        url: item.url,
        metadata: commonMetadata,
      });
    }
  });

  return artifacts;
}

function safeDoubaoMetadata(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(typeof raw.id === 'string' ? { id: raw.id } : {}),
    ...(typeof raw.created === 'number' ? { created: raw.created } : {}),
    ...(typeof raw.model === 'string' ? { model: raw.model } : {}),
    ...(isRecord(raw.usage) ? { usage: raw.usage } : {}),
  };
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

async function readSafeErrorBody(response: Response) {
  try {
    const body = await response.text();
    return body.trim().slice(0, 500) || 'empty response body';
  } catch {
    return 'unreadable response body';
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function imageTitle(index: number) {
  return index === 0 ? 'Generated image' : `Generated image ${index + 1}`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
