import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowWorkflowVideoConfigEditor } from './admin-action-controls';

test('shouldShowWorkflowVideoConfigEditor returns true for workflow-video-mvp', () => {
  assert.equal(shouldShowWorkflowVideoConfigEditor('workflow-video-mvp'), true);
  assert.equal(shouldShowWorkflowVideoConfigEditor('workflow-storyboard-template'), false);
});
