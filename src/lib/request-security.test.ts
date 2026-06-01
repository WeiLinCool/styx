import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRequestBodyHash,
  shouldDedupeGetRequest,
  resolveTransportSecurityMode,
} from './request-security';

test('resolveTransportSecurityMode treats localhost http as compatible by default', () => {
  assert.equal(resolveTransportSecurityMode('http:', 'localhost', 'compatible'), 'compatible');
  assert.equal(resolveTransportSecurityMode('http:', '127.0.0.1', 'compatible'), 'compatible');
});

test('buildRequestBodyHash is stable for equivalent JSON payloads', () => {
  assert.equal(
    buildRequestBodyHash({ a: 1, b: 'x' }),
    buildRequestBodyHash({ a: 1, b: 'x' }),
  );
});

test('shouldDedupeGetRequest only dedupes identical short-window GETs', () => {
  assert.equal(shouldDedupeGetRequest({ method: 'GET', url: '/api/auth/me' }), true);
  assert.equal(shouldDedupeGetRequest({ method: 'POST', url: '/api/auth/login' }), false);
});
