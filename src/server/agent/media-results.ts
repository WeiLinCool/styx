import type { AgentArtifactInput } from '@/server/repositories/agent-runs';
import type {
  DirectMediaArtifactCompletedPayload,
  DirectMediaResultDto,
} from './types';

type SanitizedAgentArtifact = AgentArtifactInput & {
  metadata: Record<string, unknown>;
};

const DIRECT_MEDIA_KINDS = new Set(['image', 'video']);

function isDirectMediaKind(kind: string): kind is DirectMediaResultDto['kind'] {
  return DIRECT_MEDIA_KINDS.has(kind);
}

function cloneMetadata(metadata: Record<string, unknown> | undefined) {
  return structuredClone(metadata ?? {});
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function deliveryFromArtifact(artifact: AgentArtifactInput) {
  if (artifact.url?.startsWith('http://') || artifact.url?.startsWith('https://')) {
    return { mode: 'provider_url' as const, url: artifact.url };
  }

  if (artifact.url?.startsWith('data:')) {
    return { mode: 'data_url' as const, url: artifact.url };
  }

  if (artifact.body?.startsWith('data:')) {
    return { mode: 'data_url' as const, url: artifact.body };
  }

  return null;
}

export function toDirectMediaResult(artifact: AgentArtifactInput): DirectMediaResultDto | null {
  if (!isDirectMediaKind(artifact.kind)) {
    return null;
  }

  const delivery = deliveryFromArtifact(artifact);
  if (!delivery) {
    return null;
  }

  const metadata = cloneMetadata(artifact.metadata);
  const expiresAt = readString(metadata, 'providerExpiresAt') ?? readString(metadata, 'expiresAt');
  const mimeType = readString(metadata, 'mimeType') ?? undefined;
  const filename = readString(metadata, 'filename') ?? undefined;
  const width = readNumber(metadata, 'width') ?? undefined;
  const height = readNumber(metadata, 'height') ?? undefined;
  const durationSeconds = readNumber(metadata, 'durationSeconds') ?? undefined;
  const providerTaskId = readString(metadata, 'providerTaskId') ?? undefined;
  const model = readString(metadata, 'model') ?? undefined;

  return {
    kind: artifact.kind,
    title: artifact.title,
    delivery: {
      ...delivery,
      expiresAt,
    },
    metadata: {
      ...metadata,
      storageStatus: 'provider_direct',
      ...(mimeType !== undefined ? { mimeType } : {}),
      ...(filename !== undefined ? { filename } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(providerTaskId !== undefined ? { providerTaskId } : {}),
      ...(model !== undefined ? { model } : {}),
    },
  };
}

export function sanitizeDirectMediaArtifact(artifact: AgentArtifactInput): SanitizedAgentArtifact {
  const media = toDirectMediaResult(artifact);
  const metadata = cloneMetadata(artifact.metadata);

  if (!media) {
    return {
      ...artifact,
      metadata,
    };
  }

  return {
    kind: artifact.kind,
    title: artifact.title,
    body: null,
    url: null,
    metadata: {
      ...metadata,
      storageStatus: 'provider_direct',
      deliveryMode: media.delivery.mode,
      providerExpiresAt: media.delivery.expiresAt,
    },
  };
}

export function createDirectMediaEventPayload(
  artifact: DirectMediaResultDto,
): DirectMediaArtifactCompletedPayload {
  return { artifact };
}
