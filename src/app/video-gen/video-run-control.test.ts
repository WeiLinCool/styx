import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VIDEO_RUN_CONNECTION_LOST_MESSAGE,
  shouldKeepVideoRunPolling,
} from './video-run-control';

test('keeps polling while a video run is still running', () => {
  assert.equal(shouldKeepVideoRunPolling('queued'), true);
  assert.equal(shouldKeepVideoRunPolling('running'), true);
  assert.equal(shouldKeepVideoRunPolling('succeeded'), false);
  assert.equal(shouldKeepVideoRunPolling('failed'), false);
  assert.equal(shouldKeepVideoRunPolling('cancelled'), false);
});

test('uses the expected connection lost message for background sync', () => {
  assert.equal(
    VIDEO_RUN_CONNECTION_LOST_MESSAGE,
    '连接已中断，任务仍可能在后台运行，请稍后从历史记录查看。',
  );
});
