import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_HELP_CENTER_GROUPS,
  getAdminHelpCenterQuickLinks,
  getAdminHelpCenterRelationshipCount,
} from './admin-help-center-config';

test('help center config covers grouped modules and quick links', () => {
  assert.equal(ADMIN_HELP_CENTER_GROUPS.length, 4);
  assert.equal(getAdminHelpCenterRelationshipCount() >= 3, true);

  const quickLinks = getAdminHelpCenterQuickLinks();
  assert.ok(quickLinks.some((item) => item.href === '/admin/help-center'));
  assert.ok(quickLinks.some((item) => item.href === '/admin/users'));
});
