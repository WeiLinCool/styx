import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  const dailyCheckinColumns = new Map(
    dailyCheckinsConfig.columns.map((column) => [column.name, column]),
  );
  const dailyCheckinDate = dailyCheckinsConfig.columns.find(
    (column) => column.name === 'checkin_date',
  );
  assert.ok(dailyCheckinDate);
  assert.equal(dailyCheckinDate.getSQLType(), 'date');
  assert.equal(dailyCheckinColumns.get('streak_count')?.default, 1);
  assert.ok(
    dailyCheckinsConfig.checks.some(
      (constraint) => constraint.name === 'user_daily_checkins_streak_count_positive',
    ),
  );
  assert.equal(dailyCheckinColumns.has('qualified_at'), false);
  assert.equal(dailyCheckinColumns.has('qualified_by'), false);
  assert.ok(
    dailyCheckinsConfig.foreignKeys.some(
      (foreignKey) =>
        foreignKey.getName() ===
        'user_daily_checkins_reward_ledger_entry_id_credit_ledger_entries_id_fk',
    ),
  );

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
  const inviteCodeStatus = inviteCodesConfig.columns.find(
    (column) => column.name === 'status',
  );
  assert.ok(inviteCodeStatus);
  assert.equal(inviteCodeStatus.getSQLType(), 'user_invite_code_status');
  assert.equal(inviteCodeStatus.default, 'active');
  const activeInviteCodeIndex = inviteCodesConfig.indexes.find(
    (index) => index.config.name === 'user_invite_codes_active_user_unique_idx',
  );
  assert.ok(activeInviteCodeIndex);
  assert.equal(activeInviteCodeIndex.config.unique, true);
  assert.equal(activeInviteCodeIndex.config.columns.length, 1);
  assert.equal(activeInviteCodeIndex.config.columns[0]?.name, 'user_id');
  assert.ok(activeInviteCodeIndex.config.where);
  assert.ok(
    inviteCodesConfig.checks.some(
      (constraint) =>
        constraint.name === 'user_invite_codes_status_disabled_at_consistent',
    ),
  );

  const referralsConfig = getTableConfig(userReferrals);
  const referralColumns = new Map(
    referralsConfig.columns.map((column) => [column.name, column]),
  );
  assert.equal(
    referralColumns.get('qualified_by')?.getSQLType(),
    'referral_conversion_trigger',
  );
  assert.equal(referralColumns.has('invite_code_snapshot'), true);
  const migrationSnapshot = JSON.parse(
    fs.readFileSync(new URL('../../../drizzle/meta/0006_snapshot.json', import.meta.url), 'utf8'),
  ) as {
    enums: Record<string, { values: string[] }>;
  };
  assert.deepEqual(
    migrationSnapshot.enums['public.referral_conversion_trigger']?.values,
    ['order_paid', 'membership_activated'],
  );
  assert.ok(
    referralsConfig.foreignKeys.some(
      (foreignKey) =>
        foreignKey.getName() ===
        'user_referrals_reward_ledger_entry_id_credit_ledger_entries_id_fk',
    ),
  );
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
