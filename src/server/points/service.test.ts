import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseDailyCheckinReward,
  buildReferralRewardKey,
  buildDailyCheckinKey,
} from './service';

test('chooseDailyCheckinReward always returns an integer between 1 and 3', () => {
  for (let index = 0; index < 100; index += 1) {
    const reward = chooseDailyCheckinReward();
    assert.equal(Number.isInteger(reward), true);
    assert.equal(reward >= 1 && reward <= 3, true);
  }
});

test('buildReferralRewardKey keys rewards by referred user', () => {
  assert.equal(
    buildReferralRewardKey('user-123'),
    'referral-reward:referred-user:user-123',
  );
});

test('buildDailyCheckinKey keys rewards by user and business date', () => {
  assert.equal(
    buildDailyCheckinKey('user-123', '2026-05-30'),
    'daily-checkin:user-123:2026-05-30',
  );
});
