import assert from 'node:assert/strict';
import test from 'node:test';

import { storageUpgradeDialogCopy } from './storage-upgrade-dialog';

test('storage upgrade dialog copy points to membership yearly plan', () => {
  assert.equal(storageUpgradeDialogCopy.title, '存储空间不足');
  assert.equal(storageUpgradeDialogCopy.action, '去开通云空间升级');
  assert.equal(storageUpgradeDialogCopy.link, '/membership?plan=yearly');
});
