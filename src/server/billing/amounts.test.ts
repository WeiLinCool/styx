import assert from 'node:assert/strict';
import test from 'node:test';

import { coerceCreditAmount, roundCreditAmount } from './amounts';

test('roundCreditAmount keeps two decimal places', () => {
  assert.equal(roundCreditAmount(0.555), 0.56);
  assert.equal(roundCreditAmount(1285.5), 1285.5);
});

test('coerceCreditAmount converts numeric strings from the database into numbers', () => {
  assert.equal(coerceCreditAmount('01285.50'), 1285.5);
  assert.equal(coerceCreditAmount('-0.50'), -0.5);
  assert.equal(coerceCreditAmount(3), 3);
  assert.equal(coerceCreditAmount(null), 0);
});
