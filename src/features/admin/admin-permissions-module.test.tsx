import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  AdminPermissionsModule,
  normalizePermissionCodes,
} from './admin-permissions-module';

test('normalizePermissionCodes falls back to an empty array for invalid values', () => {
  assert.deepEqual(normalizePermissionCodes(undefined), []);
  assert.deepEqual(normalizePermissionCodes(null), []);
  assert.deepEqual(normalizePermissionCodes('page.user_center'), []);
  assert.deepEqual(normalizePermissionCodes(['page.user_center', 1, null]), ['page.user_center']);
});

test('admin permissions module shows selected plan bindings', () => {
  const html = renderToStaticMarkup(
    <AdminPermissionsModule
      data={{
        overview: {
          source: 'seed',
          metrics: [{ label: '页面', value: '1', hint: 'page', tone: 'success' }],
          filters: [{ label: 'All', value: 'all', count: 1 }],
          records: [],
        },
        workspace: {
          plan: { id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' },
          plans: [{ id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' }],
          selectedCodes: ['page.user_center'],
          modules: [
            {
              key: 'user-center',
              label: 'user-center',
              resources: [
                {
                  id: 'resource-1',
                  code: 'page.user_center',
                  name: '用户中心页面',
                  resourceType: 'page',
                  description: '允许访问用户中心页面。',
                  routePattern: '/user-center',
                  actionKey: null,
                  dependsOn: [],
                  recommendedWith: [],
                },
              ],
            },
          ],
        },
      }}
    />,
  );

  assert.match(html, /Pro Monthly/);
  assert.match(html, /用户中心页面/);
});

test('admin permissions module can render embedded mode without plan sidebar copy', () => {
  const html = renderToStaticMarkup(
    <AdminPermissionsModule
      mode="embedded"
      data={{
        overview: {
          source: 'seed',
          metrics: [{ label: '页面', value: '1', hint: 'page', tone: 'success' }],
          filters: [{ label: 'All', value: 'all', count: 1 }],
          records: [],
        },
        workspace: {
          plan: { id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' },
          plans: [{ id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' }],
          selectedCodes: ['page.user_center'],
          modules: [
            {
              key: 'user-center',
              label: 'user-center',
              resources: [
                {
                  id: 'resource-1',
                  code: 'page.user_center',
                  name: '用户中心页面',
                  resourceType: 'page',
                  description: '允许访问用户中心页面。',
                  routePattern: '/user-center',
                  actionKey: null,
                  dependsOn: [],
                  recommendedWith: [],
                },
              ],
            },
          ],
        },
      }}
    />,
  );

  assert.doesNotMatch(html, /选择要配置的方案/);
  assert.match(html, /用户中心页面/);
});
