import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeBrowserFingerprint } from './browser-fingerprint';

test('normalizeBrowserFingerprint uses fallback values for missing browser fields', () => {
  assert.deepEqual(normalizeBrowserFingerprint({}), {
    colorDepth: 0,
    hardwareConcurrency: 0,
    language: 'unknown',
    platform: 'unknown',
    screen: {
      height: 0,
      width: 0,
    },
    timezone: 'unknown',
    userAgent: 'unknown',
  });
});

test('normalizeBrowserFingerprint keeps stable keys for provided browser fields', () => {
  assert.deepEqual(
    normalizeBrowserFingerprint({
      colorDepth: 30,
      hardwareConcurrency: 10,
      language: 'zh-CN',
      platform: 'MacIntel',
      screenHeight: 900,
      screenWidth: 1440,
      timezone: 'Asia/Shanghai',
      userAgent: 'Mozilla/5.0',
    }),
    {
      colorDepth: 30,
      hardwareConcurrency: 10,
      language: 'zh-CN',
      platform: 'MacIntel',
      screen: {
        height: 900,
        width: 1440,
      },
      timezone: 'Asia/Shanghai',
      userAgent: 'Mozilla/5.0',
    },
  );
});
