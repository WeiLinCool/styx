import assert from 'node:assert/strict';
import test from 'node:test';
import { Table } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

import {
  userDailyCheckins,
  userInviteCodes,
  userReferrals,
} from './schema';

test('points-growth tables expose the expected schema shape', () => {
  assert.equal(userInviteCodes[Table.Symbol.Name], 'user_invite_codes');
  assert.equal(userReferrals[Table.Symbol.Name], 'user_referrals');
  assert.equal(userDailyCheckins[Table.Symbol.Name], 'user_daily_checkins');

  const dailyCheckinsConfig = getTableConfig(userDailyCheckins);
  const dailyCheckinDate = dailyCheckinsConfig.columns.find(
    (column) => column.name === 'checkin_date',
  );
  assert.ok(dailyCheckinDate);
  assert.equal(dailyCheckinDate.getSQLType(), 'date');

  const dailyCheckinUniqueIndex = dailyCheckinsConfig.indexes.find(
    (index) => index.config.name === 'user_daily_checkins_user_date_unique_idx',
  );
  assert.ok(dailyCheckinUniqueIndex);
  assert.equal(dailyCheckinUniqueIndex.config.unique, true);
  assert.deepEqual(
    dailyCheckinUniqueIndex.config.columns.map((column) => column.name),
    ['user_id', 'checkin_date'],
  );

  const inviteCodesConfig = getTableConfig(userInviteCodes);
  const activeInviteCodeIndex = inviteCodesConfig.indexes.find(
    (index) => index.config.name === 'user_invite_codes_active_user_unique_idx',
  );
  assert.ok(activeInviteCodeIndex);
  assert.equal(activeInviteCodeIndex.config.unique, true);
  assert.equal(activeInviteCodeIndex.config.columns.length, 1);
  assert.equal(activeInviteCodeIndex.config.columns[0]?.name, 'user_id');
  assert.ok(activeInviteCodeIndex.config.where);

  const referralsConfig = getTableConfig(userReferrals);
  const referredUserUniqueIndex = referralsConfig.indexes.find(
    (index) => index.config.name === 'user_referrals_referred_user_id_unique_idx',
  );
  assert.ok(referredUserUniqueIndex);
  assert.equal(referredUserUniqueIndex.config.unique, true);
  assert.deepEqual(
    referredUserUniqueIndex.config.columns.map((column) => column.name),
    ['referred_user_id'],
  );
});
