import { createHash, randomUUID } from 'node:crypto';

export type TransportSecurityMode = 'strict' | 'compatible' | 'insecure';
export type TransportSecurityState = 'secure' | 'insecure';
export type RouteProtectionKind =
  | 'public'
  | 'user-read'
  | 'user-mutation'
  | 'sensitive-user-mutation'
  | 'admin-read'
  | 'admin-mutation'
  | 'sensitive-admin-mutation';

export type RequestProtectionFailureCode =
  | 'transport_security_required'
  | 'request_metadata_required'
  | 'request_timestamp_expired'
  | 'request_body_hash_mismatch'
  | 'browser_fingerprint_required';

export type RequestProtectionResult =
  | {
      allowed: true;
      mode: TransportSecurityMode;
      transportSecurity: TransportSecurityState;
      degradedTransport: boolean;
      fingerprintDigest: string | null;
      requestId: string;
      nonce: string;
      bodyHash: string | null;
    }
  | {
      allowed: false;
      code: RequestProtectionFailureCode;
      status: number;
      message: string;
      mode: TransportSecurityMode;
      transportSecurity: TransportSecurityState;
      degradedTransport: boolean;
    };

export type RequestProtectionEvaluationInput = {
  routeKind: RouteProtectionKind;
  method: string;
  pathname: string;
  transportMode?: TransportSecurityMode;
  requestUrl: string;
  headers: Headers;
  body?: unknown;
  rawBody?: string | null;
  decryptedRawBody?: string | null;
  now?: number;
  timestampToleranceMs?: number;
};

export type ResolvedRequestTransport = {
  mode: TransportSecurityMode;
  transportSecurity: TransportSecurityState;
  degradedTransport: boolean;
  protocol: string;
  hostname: string;
};

const DEFAULT_TRANSPORT_SECURITY_MODE: TransportSecurityMode = 'compatible';
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function readConfiguredTransportSecurityMode(
  raw = process.env.STYX_TRANSPORT_SECURITY_MODE,
): TransportSecurityMode {
  if (raw === 'strict' || raw === 'compatible' || raw === 'insecure') {
    return raw;
  }

  return DEFAULT_TRANSPORT_SECURITY_MODE;
}

export function resolveTransportSecurityMode(
  protocol: string,
  hostname: string,
  configured: TransportSecurityMode,
): TransportSecurityMode {
  if (configured === 'strict' && protocol.toLowerCase() === 'http:' && isLocalHostname(hostname)) {
    return 'compatible';
  }

  return configured;
}

export function resolveRequestTransport(
  request: Pick<Request, 'url'>,
  configured: TransportSecurityMode = readConfiguredTransportSecurityMode(),
): ResolvedRequestTransport {
  const url = new URL(request.url);
  const mode = resolveTransportSecurityMode(url.protocol, url.hostname, configured);
  const transportSecurity = url.protocol === 'https:' ? 'secure' : 'insecure';

  return {
    mode,
    transportSecurity,
    degradedTransport: transportSecurity === 'insecure',
    protocol: url.protocol,
    hostname: url.hostname,
  };
}

export function buildStableRequestBodyHash(body: unknown): string {
  return `sha256:${createHash('sha256').update(stableJsonStringify(body)).digest('hex')}`;
}

export function buildRequestBodyHashCandidates(body: unknown): Set<string> {
  const stableBody = stableJsonStringify(body);
  return new Set([
    `sha256:${createHash('sha256').update(stableBody).digest('hex')}`,
    buildFnv1aRequestBodyHash(stableBody),
  ]);
}

export function parseRequestFingerprint(headers: Headers): string | null {
  return firstHeader(headers, [
    'x-browser-fingerprint',
    'x-browser-fingerprint-digest',
    'x-request-fingerprint',
  ]);
}

export function isProtectedRoute(method: string, pathname: string): boolean {
  const normalizedMethod = method.toUpperCase();
  if (!MUTATION_METHODS.has(normalizedMethod)) {
    return false;
  }

  return (
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/api/account/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/user/') ||
    pathname.startsWith('/api/agent/runs')
  );
}

export function evaluateRequestProtection(
  input: RequestProtectionEvaluationInput,
): RequestProtectionResult {
  const now = input.now ?? Date.now();
  const toleranceMs = input.timestampToleranceMs ?? DEFAULT_TIMESTAMP_TOLERANCE_MS;
  const transport = resolveRequestTransport(
    { url: input.requestUrl },
    input.transportMode ?? readConfiguredTransportSecurityMode(),
  );
  const method = input.method.toUpperCase();
  const protectedRoute =
    input.routeKind !== 'public' && isProtectedRoute(method, input.pathname);

  if (
    transport.mode === 'strict' &&
    transport.transportSecurity === 'insecure' &&
    !isLocalHostname(transport.hostname)
  ) {
    return deny('transport_security_required', 426, transport);
  }

  if (!protectedRoute) {
    return allow(input.headers, transport, null);
  }

  const requestId = firstHeader(input.headers, ['x-request-id']);
  const nonce = firstHeader(input.headers, ['x-request-nonce']);
  const timestampRaw = firstHeader(input.headers, ['x-client-timestamp']);
  if (!requestId || !nonce || !timestampRaw) {
    return deny('request_metadata_required', 400, transport);
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > toleranceMs) {
    return deny('request_timestamp_expired', 400, transport);
  }

  const expectedBodyHash = firstHeader(input.headers, ['x-request-body-hash']);
  if (MUTATION_METHODS.has(method) && expectedBodyHash) {
    const actualHashes = buildRequestBodyHashCandidates(input.body ?? null);
    if (input.rawBody !== undefined && input.rawBody !== null) {
      actualHashes.add(buildRawRequestBodyHash(input.rawBody));
      actualHashes.add(buildFnv1aRequestBodyHash(input.rawBody));
    }
    if (input.decryptedRawBody !== undefined && input.decryptedRawBody !== null) {
      actualHashes.add(buildRawRequestBodyHash(input.decryptedRawBody));
      actualHashes.add(buildFnv1aRequestBodyHash(input.decryptedRawBody));
    }

    if (!actualHashes.has(expectedBodyHash)) {
      return deny('request_body_hash_mismatch', 400, transport);
    }
  }

  const fingerprintDigest = parseRequestFingerprint(input.headers);
  if (requiresFingerprint(input.routeKind, transport) && !fingerprintDigest) {
    return deny('browser_fingerprint_required', 400, transport);
  }

  return {
    allowed: true,
    mode: transport.mode,
    transportSecurity: transport.transportSecurity,
    degradedTransport: transport.degradedTransport,
    fingerprintDigest,
    requestId,
    nonce,
    bodyHash: expectedBodyHash,
  };
}

export function protectionFailureResponseBody(result: Extract<RequestProtectionResult, { allowed: false }>) {
  return {
    error: {
      code: result.code,
      message: result.message,
    },
    transportSecurity: result.transportSecurity,
    degradedTransport: result.degradedTransport,
  };
}

export function buildProtectionHeaders(input: {
  now?: number;
  body?: unknown;
  fingerprint?: string | null;
  requestId?: string;
  nonce?: string;
  idempotencyKey?: string;
}) {
  const headers = new Headers();
  headers.set('x-request-id', input.requestId ?? randomUUID());
  headers.set('x-request-nonce', input.nonce ?? randomUUID());
  headers.set('x-client-timestamp', String(input.now ?? Date.now()));
  headers.set('x-request-body-hash', buildStableRequestBodyHash(input.body ?? null));
  headers.set('Idempotency-Key', input.idempotencyKey ?? randomUUID());
  if (input.fingerprint) {
    headers.set('x-browser-fingerprint', input.fingerprint);
  }

  return headers;
}

export function buildRawRequestBodyHash(body: string) {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

export function buildFnv1aRequestBodyHash(body: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < body.length; index += 1) {
    hash ^= body.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function allow(
  headers: Headers,
  transport: ResolvedRequestTransport,
  bodyHash: string | null,
): RequestProtectionResult {
  return {
    allowed: true,
    mode: transport.mode,
    transportSecurity: transport.transportSecurity,
    degradedTransport: transport.degradedTransport,
    fingerprintDigest: parseRequestFingerprint(headers),
    requestId: firstHeader(headers, ['x-request-id']) ?? '',
    nonce: firstHeader(headers, ['x-request-nonce']) ?? '',
    bodyHash,
  };
}

function deny(
  code: RequestProtectionFailureCode,
  status: number,
  transport: ResolvedRequestTransport,
): RequestProtectionResult {
  return {
    allowed: false,
    code,
    status,
    message: securityErrorMessage(code),
    mode: transport.mode,
    transportSecurity: transport.transportSecurity,
    degradedTransport: transport.degradedTransport,
  };
}

function securityErrorMessage(code: RequestProtectionFailureCode) {
  switch (code) {
    case 'transport_security_required':
      return 'Secure transport is required for this request.';
    case 'request_timestamp_expired':
      return 'Request timestamp is expired.';
    case 'request_body_hash_mismatch':
      return 'Request body hash does not match.';
    case 'browser_fingerprint_required':
      return 'Browser fingerprint is required for this request.';
    case 'request_metadata_required':
    default:
      return 'Required request metadata is missing.';
  }
}

function firstHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return null;
}

function requiresFingerprint(
  routeKind: RouteProtectionKind,
  transport: ResolvedRequestTransport,
) {
  if (routeKind === 'sensitive-user-mutation' || routeKind === 'sensitive-admin-mutation') {
    return true;
  }

  return routeKind === 'admin-mutation' && transport.transportSecurity === 'insecure';
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(',')}]`;
  }

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`)
    .join(',')}}`;
}
