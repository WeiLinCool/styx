import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminPermissionsModule } from './admin-permissions-module';

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
