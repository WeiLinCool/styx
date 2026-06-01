import { createHash } from 'node:crypto';

export type TransportSecurityMode = 'strict' | 'compatible' | 'insecure';

export function resolveTransportSecurityMode(
  protocol: string,
  hostname: string,
  configured: TransportSecurityMode,
): TransportSecurityMode {
  const normalizedProtocol = protocol.toLowerCase();
  const normalizedHostname = hostname.toLowerCase();

  if (
    configured === 'strict' &&
    normalizedProtocol === 'http:' &&
    isLocalHostname(normalizedHostname)
  ) {
    return 'compatible';
  }

  return configured;
}

export function buildRequestBodyHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

export function shouldDedupeGetRequest(input: { method: string; url: string }): boolean {
  return input.method.toUpperCase() === 'GET';
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
