import assert from 'node:assert/strict';
import test from 'node:test';

import { getAdminDashboard } from './admin-dashboard';

test('getAdminDashboard returns safe seeded fallback without DATABASE_URL in development', async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  Reflect.set(process.env, 'NODE_ENV', 'development');
  delete process.env.DATABASE_URL;

  try {
    const dashboard = await getAdminDashboard();

    assert.equal(dashboard.source, 'seed');
    assert.ok(dashboard.kpis.length >= 4);
    assert.ok(dashboard.recentUsers.length > 0);
    assert.ok(dashboard.recentAiJobs.length > 0);
    assert.ok(dashboard.recentOrders.length > 0);
    assert.ok(dashboard.partnerLeads.length > 0);
    assert.ok(dashboard.notices.some((notice) => notice.tone === 'warning'));
  } finally {
    Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);

    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  }
});
