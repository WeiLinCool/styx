import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldUseDevelopmentAuth } from './session';

test('development auth is enabled only when explicitly configured and not blocked by logout', () => {
  assert.equal(
    shouldUseDevelopmentAuth({
      nodeEnv: 'development',
      devAuthEnabled: 'true',
      devUserId: '00000000-0000-4000-8000-000000000001',
      devAuthBlocked: false,
    }),
    true,
  );

  assert.equal(
    shouldUseDevelopmentAuth({
      nodeEnv: 'development',
      devAuthEnabled: 'true',
      devUserId: '00000000-0000-4000-8000-000000000001',
      devAuthBlocked: true,
    }),
    false,
  );
});

test('development auth is disabled without explicit local configuration', () => {
  assert.equal(
    shouldUseDevelopmentAuth({
      nodeEnv: 'production',
      devAuthEnabled: 'true',
      devUserId: '00000000-0000-4000-8000-000000000001',
      devAuthBlocked: false,
    }),
    false,
  );

  assert.equal(
    shouldUseDevelopmentAuth({
      nodeEnv: 'development',
      devAuthEnabled: 'false',
      devUserId: '00000000-0000-4000-8000-000000000001',
      devAuthBlocked: false,
    }),
    false,
  );

  assert.equal(
    shouldUseDevelopmentAuth({
      nodeEnv: 'development',
      devAuthEnabled: 'true',
      devUserId: null,
      devAuthBlocked: false,
    }),
    false,
  );
});
