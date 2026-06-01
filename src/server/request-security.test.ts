import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProtectionHeaders,
  evaluateRequestProtection,
  parseRequestFingerprint,
  resolveRequestTransport,
} from './request-security';

test('protected admin mutation rejects missing request metadata before domain code', () => {
  const result = evaluateRequestProtection({
    routeKind: 'admin-mutation',
    method: 'POST',
    pathname: '/api/admin/users/1/activate',
    transportMode: 'compatible',
    requestUrl: 'http://localhost/api/admin/users/1/activate',
    headers: new Headers(),
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'request_metadata_required');
    assert.equal(result.status, 400);
  }
});

test('strict mode rejects non-local HTTP protected requests', () => {
  const headers = buildProtectionHeaders({
    now: Date.now(),
    body: { reason: 'duplicate click' },
    fingerprint: 'fp-admin',
  });

  const result = evaluateRequestProtection({
    routeKind: 'admin-mutation',
    method: 'POST',
    pathname: '/api/admin/users/1/activate',
    transportMode: 'strict',
    requestUrl: 'http://example.com/api/admin/users/1/activate',
    headers,
    body: { reason: 'duplicate click' },
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'transport_security_required');
    assert.equal(result.status, 426);
  }
});

test('compatible mode allows HTTP user mutations and records degraded transport', () => {
  const headers = buildProtectionHeaders({
    now: Date.now(),
    body: { phone: '13800000000' },
    fingerprint: 'fp-user',
  });

  const result = evaluateRequestProtection({
    routeKind: 'user-mutation',
    method: 'POST',
    pathname: '/api/auth/login',
    transportMode: 'compatible',
    requestUrl: 'http://example.com/api/auth/login',
    headers,
    body: { phone: '13800000000' },
  });

  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.transportSecurity, 'insecure');
    assert.equal(result.degradedTransport, true);
    assert.equal(result.fingerprintDigest, 'fp-user');
  }
});

test('admin mutation requires browser fingerprint in insecure transport', () => {
  const headers = buildProtectionHeaders({
    now: Date.now(),
    body: { reason: 'manual review' },
  });

  const result = evaluateRequestProtection({
    routeKind: 'admin-mutation',
    method: 'POST',
    pathname: '/api/admin/users/1/suspend',
    transportMode: 'compatible',
    requestUrl: 'http://example.com/api/admin/users/1/suspend',
    headers,
    body: { reason: 'manual review' },
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'browser_fingerprint_required');
  }
});

test('body hash mismatch rejects mutation requests', () => {
  const headers = buildProtectionHeaders({
    now: Date.now(),
    body: { amount: 1 },
    fingerprint: 'fp-admin',
  });

  const result = evaluateRequestProtection({
    routeKind: 'admin-mutation',
    method: 'POST',
    pathname: '/api/admin/users/1/points',
    transportMode: 'compatible',
    requestUrl: 'https://example.com/api/admin/users/1/points',
    headers,
    body: { amount: 2 },
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'request_body_hash_mismatch');
  }
});

test('expired client timestamp rejects protected mutations', () => {
  const headers = buildProtectionHeaders({
    now: Date.now() - 10 * 60 * 1000,
    body: { phone: '13800000000' },
    fingerprint: 'fp-user',
  });

  const result = evaluateRequestProtection({
    routeKind: 'user-mutation',
    method: 'POST',
    pathname: '/api/auth/login',
    transportMode: 'compatible',
    requestUrl: 'https://example.com/api/auth/login',
    headers,
    body: { phone: '13800000000' },
    now: Date.now(),
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.code, 'request_timestamp_expired');
  }
});

test('fingerprint parser normalizes known request headers', () => {
  assert.equal(
    parseRequestFingerprint(
      new Headers({
        'x-browser-fingerprint': '  fp-123  ',
      }),
    ),
    'fp-123',
  );
});

test('transport resolver defaults to compatible and flags insecure HTTP', () => {
  const transport = resolveRequestTransport(
    new Request('http://example.com/api/auth/login'),
  );

  assert.equal(transport.mode, 'compatible');
  assert.equal(transport.transportSecurity, 'insecure');
  assert.equal(transport.degradedTransport, true);
});
