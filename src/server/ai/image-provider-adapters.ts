import { FormData as UndiciFormData } from 'undici';
import type {
  ImageModelMode,
  ResolvedImageModel,
} from '@/server/repositories/ai-models';
import type { AgentArtifactInput } from '@/server/repositories/agent-runs';
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

export type ImageProviderRequest = {
  runId: string;
  userId: string;
  model: ResolvedImageModel;
  mode: ImageModelMode;
  prompt: string;
  size?: string;
  scale?: string;
  sourceImageDataUrl?: string;
  additionalImageDataUrls?: string[];
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

type ProviderRequestTransport = {
  endpoint: URL;
  headers: HeadersInit;
  body: string | UndiciFormData;
};

export function createDoubaoImageProviderAdapter(input: {
  fetch?: FetchLike;
  readEnv?: ReadEnv;
} = {}): ImageProviderAdapter {
  const fetchImpl = input.fetch ?? selectOpenAiCompatibleFetch();
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

      const transport = createImageProviderRequestTransport(request, baseUrl);
      let response: Response;
      try {
        response = await fetchImpl(transport.endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            ...transport.headers,
          },
          body: transport.body as unknown as BodyInit,
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
      return parseDoubaoImageResponse(raw, {
        model: request.model.model,
        mode: request.mode,
      });
    },
  };
}

function createImageProviderRequestTransport(
  request: ImageProviderRequest,
  baseUrl: string,
): ProviderRequestTransport {
  if (shouldUseOpenAiImageEditTransport(request)) {
    return {
      endpoint: createOpenAiImageEditEndpoint(baseUrl),
      headers: {},
      body: createOpenAiImageEditFormData(request),
    };
  }

  return {
    endpoint: createImageGenerationEndpoint(baseUrl),
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(createDoubaoImageRequestBody(request)),
  };
}

function shouldUseOpenAiImageEditTransport(request: ImageProviderRequest) {
  return request.mode === 'edit' && isOpenAiEditModel(request.model);
}

function isOpenAiEditModel(model: ResolvedImageModel) {
  const providerCode = model.providerCode.trim().toLowerCase();
  const providerName = model.providerName.trim().toLowerCase();
  const baseUrl = model.baseUrl?.trim().toLowerCase() ?? '';
  const modelName = model.model.trim().toLowerCase();

  return (
    providerCode === 'openai' ||
    providerCode.startsWith('openai') ||
    providerName.includes('openai') ||
    baseUrl.includes('api.openai.com') ||
    modelName.startsWith('gpt-image-')
  );
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
    response_format: 'b64_json',
    ...(request.size ? { size: request.size } : {}),
    ...(request.scale ? { scale: request.scale } : {}),
    ...(request.sourceImageDataUrl && request.mode !== 'generate'
      ? {
          image: request.sourceImageDataUrl,
        }
      : {}),
  };
}

function createOpenAiImageEditFormData(request: ImageProviderRequest): UndiciFormData {
  const sourceImageDataUrl = request.sourceImageDataUrl;
  const additionalImageDataUrls = Array.isArray(request.additionalImageDataUrls)
    ? request.additionalImageDataUrls.filter((value) => typeof value === 'string' && value.length > 0)
    : [];
  if (!sourceImageDataUrl && additionalImageDataUrls.length === 0) {
    throw new ProviderRequestError('Provider image edit request is missing a source image.');
  }

  const formData = new UndiciFormData();
  formData.set('model', request.model.model);
  formData.set('prompt', request.prompt);
  if (request.size) {
    formData.set('size', request.size);
  }

  for (const dataUrl of additionalImageDataUrls) {
    appendImageDataUrlToFormData(formData, dataUrl);
  }
  if (sourceImageDataUrl) {
    appendImageDataUrlToFormData(formData, sourceImageDataUrl);
  }
  return formData;
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

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function createImageGenerationEndpoint(baseUrl: string) {
  try {
    return new URL('images/generations', ensureTrailingSlash(baseUrl));
  } catch {
    throw new ProviderConfigurationError('Doubao image provider has invalid base URL.');
  }
}

function createOpenAiImageEditEndpoint(baseUrl: string) {
  try {
    return new URL('images/edits', ensureTrailingSlash(baseUrl));
  } catch {
    throw new ProviderConfigurationError('Doubao image provider has invalid base URL.');
  }
}

function imageTitle(index: number) {
  return index === 0 ? 'Generated image' : `Generated image ${index + 1}`;
}

function appendImageDataUrlToFormData(formData: UndiciFormData, dataUrl: string) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) {
    throw new ProviderRequestError('Provider image edit request source image is invalid.');
  }

  const mimeType = match[1];
  const bytes = Buffer.from(match[2], 'base64');
  formData.append(
    'image[]',
    new Blob([bytes], { type: mimeType }),
    `source.${imageExtensionForMimeType(mimeType)}`,
  );
}

function imageExtensionForMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return 'jpg';
  }
  if (mimeType === 'image/webp') {
    return 'webp';
  }
  return 'png';
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
