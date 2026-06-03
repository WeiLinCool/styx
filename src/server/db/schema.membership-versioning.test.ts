import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import * as schema from './schema';

test('membership versioning schema exposes version tables and entitlement version link', () => {
  assert.ok(schema.membershipPlanVersions, 'membershipPlanVersions table should exist');
  assert.ok(
    schema.membershipPlanVersionBenefits,
    'membershipPlanVersionBenefits table should exist',
  );
  assert.ok(
    schema.membershipPlanVersionPermissionBindings,
    'membershipPlanVersionPermissionBindings table should exist',
  );

  const entitlementColumns = new Set(Object.keys(schema.userEntitlements));
  assert.equal(entitlementColumns.has('planVersionId'), true);
});

test('generated drizzle snapshot directory exists for membership versioning migration output', () => {
  const metaDir = new URL('../../../drizzle/meta/', import.meta.url);
  assert.ok(fs.existsSync(metaDir), 'drizzle/meta must exist after db:generate');
});
