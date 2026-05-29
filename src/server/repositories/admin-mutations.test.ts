import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapOrderStatusToEventType,
  normalizeAiJobReviewAction,
} from './admin-mutations';

test('mapOrderStatusToEventType maps admin status changes to order events', () => {
  assert.equal(mapOrderStatusToEventType('pending'), 'created');
  assert.equal(mapOrderStatusToEventType('paid'), 'paid');
  assert.equal(mapOrderStatusToEventType('fulfilled'), 'fulfilled');
  assert.equal(mapOrderStatusToEventType('cancelled'), 'cancelled');
  assert.equal(mapOrderStatusToEventType('refunded'), 'refunded');
});

test('normalizeAiJobReviewAction accepts supported admin review actions', () => {
  assert.equal(normalizeAiJobReviewAction('review'), 'review');
  assert.equal(normalizeAiJobReviewAction('rerun'), 'rerun');
  assert.equal(normalizeAiJobReviewAction('cancel'), 'cancel');
  assert.equal(normalizeAiJobReviewAction('mark_resolved'), 'mark_resolved');
});

test('normalizeAiJobReviewAction rejects unknown admin review actions', () => {
  assert.throws(
    () => normalizeAiJobReviewAction('delete'),
    /Unsupported AI job review action/,
  );
});
