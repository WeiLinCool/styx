import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAdminModuleGuideInitialOpen,
  getAdminModuleGuideToggleLabel,
} from './admin-module-guide';

test('admin module guide is collapsed by default', () => {
  assert.equal(getAdminModuleGuideInitialOpen(), false);
  assert.equal(getAdminModuleGuideInitialOpen(true), true);
});

test('admin module guide toggle label reflects current state', () => {
  assert.equal(getAdminModuleGuideToggleLabel(false), '展开');
  assert.equal(getAdminModuleGuideToggleLabel(true), '收起');
});
