import assert from 'node:assert/strict';
import test from 'node:test';
import { Table } from 'drizzle-orm';

import {
  userDailyCheckins,
  userInviteCodes,
  userReferrals,
} from './schema';

test('points-growth tables are exported from schema', () => {
  assert.equal(userInviteCodes[Table.Symbol.Name], 'user_invite_codes');
  assert.equal(userReferrals[Table.Symbol.Name], 'user_referrals');
  assert.equal(userDailyCheckins[Table.Symbol.Name], 'user_daily_checkins');
});
