import assert from 'node:assert/strict';
import test from 'node:test';

import { getAdminAiJobs } from './ai-jobs';
import { getAdminContent } from './content';
import { getAdminOrders } from './orders';
import { getAdminPartners } from './partners';
import { getAdminSettings } from './settings';
import { getAdminUsers } from './users';

const modules = [
  ['users', getAdminUsers],
  ['orders', getAdminOrders],
  ['ai jobs', getAdminAiJobs],
  ['partners', getAdminPartners],
  ['content', getAdminContent],
  ['settings', getAdminSettings],
] as const;

test('admin module repositories return seeded fallback without DATABASE_URL in development', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  Reflect.set(process.env, 'NODE_ENV', 'development');
  delete process.env.DATABASE_URL;

  try {
    for (const [name, loader] of modules) {
      const data = await loader();

      assert.equal(data.source, 'seed', name);
      assert.ok(data.records.length > 0, name);
      assert.ok(data.filters.length > 0, name);
      assert.ok(data.metrics.length > 0, name);
    }
  } finally {
    Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);

    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
});
