import { collectBrowserFingerprint, type BrowserFingerprintPayload } from '@/features/account/browser-fingerprint';
import {
  decryptResponseBody,
  encryptRequestBody,
  isEncryptedResponseEnvelope,
} from '@/lib/request-encryption';

type ApiFetch = typeof fetch;

export type ApiClientOptions = {
  fetch?: ApiFetch;
  now?: () => number;
  createId?: () => string;
  collectBrowserFingerprint?: () => BrowserFingerprintPayload | null | undefined;
};

export type UserApiClient = {
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

type ApiClientProfile = 'user' | 'admin';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function defaultCreateId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function defaultCollectBrowserFingerprint() {
  if (typeof window === 'undefined') {
    return null;
  }

  return collectBrowserFingerprint();
}

function resolveMethod(init?: RequestInit) {
  return (init?.method ?? 'GET').toUpperCase();
}

function isMutationMethod(method: string) {
  return MUTATION_METHODS.has(method);
}

function requestDedupeKey(input: RequestInfo | URL, init?: RequestInit) {
  return `${resolveMethod(init)} ${input.toString()}`;
}

function normalizeBodyForHash(body: BodyInit | null | undefined) {
  if (typeof body === 'string') {
    return canonicalizeJsonLikeString(body);
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body instanceof FormData) {
    return null;
  }

  if (body == null) {
    return '';
  }

  return String(body);
}

function canonicalizeJsonLikeString(value: string) {
  try {
    return stableStringify(JSON.parse(value));
  } catch {
    return value;
  }
}

function simpleHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

async function buildBodyHash(body: BodyInit | null | undefined) {
  const normalized = normalizeBodyForHash(body);
  if (normalized === null) {
    return null;
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return simpleHash(normalized);
  }

  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const bytes = Array.from(new Uint8Array(digest));
  return `sha256:${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function buildFingerprintDigest(fingerprint: BrowserFingerprintPayload) {
  return buildBodyHash(JSON.stringify(fingerprint));
}

async function withRequestMetadata(
  profile: ApiClientProfile,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  options: Required<Pick<ApiClientOptions, 'now' | 'createId' | 'collectBrowserFingerprint'>>,
) {
  const method = resolveMethod(init);
  const headers = new Headers(init?.headers);

  headers.set('x-api-client', profile);
  headers.set('x-request-id', options.createId());
  headers.set('x-client-timestamp', String(options.now()));
  headers.set('x-request-nonce', options.createId());

  if (isMutationMethod(method)) {
    if (!headers.has('Idempotency-Key')) {
      headers.set('Idempotency-Key', `${profile}:${options.createId()}`);
    }

    const bodyHash = await buildBodyHash(init?.body);
    if (bodyHash) {
      headers.set('x-request-body-hash', bodyHash);
    }

    const fingerprint = options.collectBrowserFingerprint();
    if (fingerprint) {
      const fingerprintDigest = await buildFingerprintDigest(fingerprint);
      if (fingerprintDigest) {
        headers.set('x-browser-fingerprint', fingerprintDigest);
        headers.set('x-browser-fingerprint-source', 'client');
      }
    }
  }

  let nextBody = init?.body;
  if (isMutationMethod(method) && typeof init?.body === 'string') {
    nextBody = await encryptRequestBody(init.body);
  }

  return {
    input,
    init: {
      ...init,
      method,
      body: nextBody,
      headers,
    },
  };
}

async function normalizeApiResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return response;
  }

  const cloned = response.clone();
  const text = await cloned.text();
  if (!text.trim()) {
    return response;
  }

  try {
    const parsed = JSON.parse(text);
    if (!isEncryptedResponseEnvelope(parsed)) {
      return response;
    }

    const decrypted = await decryptResponseBody(parsed);
    if (!decrypted?.trim()) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.delete('content-length');

    return new Response(decrypted, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  }
}

export function createApiClient(
  profile: ApiClientProfile,
  options: ApiClientOptions & { dedupeGetRequests: boolean },
): UserApiClient {
  const fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const now = options.now ?? Date.now;
  const createId = options.createId ?? defaultCreateId;
  const fingerprintCollector = options.collectBrowserFingerprint ?? defaultCollectBrowserFingerprint;
  const inFlightGets = new Map<string, Promise<Response>>();

  return {
    async request(input, init) {
      const method = resolveMethod(init);
      const useDedupe = options.dedupeGetRequests && method === 'GET';
      const dedupeKey = useDedupe ? requestDedupeKey(input, init) : null;

      if (dedupeKey) {
        const existing = inFlightGets.get(dedupeKey);
        if (existing) {
          return (await existing).clone();
        }
      }

      const responsePromise = withRequestMetadata(profile, input, init, {
        collectBrowserFingerprint: fingerprintCollector,
        createId,
        now,
      }).then((metadataRequest) => fetchImpl(metadataRequest.input, metadataRequest.init));

      if (dedupeKey) {
        inFlightGets.set(dedupeKey, responsePromise);
        responsePromise.then(
          () => inFlightGets.delete(dedupeKey),
          () => inFlightGets.delete(dedupeKey),
        );
      }

      const response = await responsePromise;
      const normalized = await normalizeApiResponse(response);
      return useDedupe ? normalized.clone() : normalized;
    },
  };
}

export function createUserApiClient(options: ApiClientOptions = {}): UserApiClient {
  return createApiClient('user', { ...options, dedupeGetRequests: true });
}

const defaultUserApiClient = createUserApiClient();

export function userApiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return defaultUserApiClient.request(input, init);
}
