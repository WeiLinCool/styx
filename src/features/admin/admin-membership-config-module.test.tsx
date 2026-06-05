import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminMembershipConfigModule } from './admin-membership-config-module';

test('admin membership config module shows version states and onboarding guide', () => {
  const html = renderToStaticMarkup(
    <AdminMembershipConfigModule
      data={{
        source: 'seed',
        metrics: [
          { label: '方案数', value: '1', hint: 'seed', tone: 'info' },
          { label: '已发布版本', value: '1', hint: 'published', tone: 'success' },
        ],
        permissionOverview: {
          source: 'seed',
          metrics: [],
          filters: [],
          records: [
            {
              id: 'resource-1',
              code: 'page.user_center',
              name: '用户中心页面',
              resourceType: 'page',
              module: 'user-center',
              description: '允许访问用户中心页面。',
              routePattern: '/user-center',
              actionKey: null,
              isActive: true,
              dependsOn: [],
              recommendedWith: [],
            },
          ],
        },
        plans: [
          {
            id: 'plan-1',
            code: 'pro-monthly',
            name: 'Pro Monthly',
            currentVersionLabel: 'V1',
            nextVersionLabel: 'Draft V2',
            priceLabel: '¥99',
          },
        ],
        workspace: {
          plan: { id: 'plan-1', code: 'pro-monthly', name: 'Pro Monthly' },
          currentVersion: {
            id: 'v1',
            planId: 'plan-1',
            planCode: 'pro-monthly',
            versionNumber: 1,
            status: 'published',
            effectiveFrom: '2026-06-01T00:00:00.000Z',
            publishedAt: '2026-06-01T00:00:00.000Z',
            displayName: 'Pro Monthly',
            description: 'Current version',
            billingPeriod: 'month',
            priceCents: 9900,
            currency: 'CNY',
            changeSummary: null,
            benefits: [],
            mediaLibraryPolicy: {
              storageQuotaBytes: 1073741824,
              allowUserUpload: true,
              allowPublicSharing: false,
            },
            permissionCodes: ['page.user_center'],
          },
          draftVersion: {
            id: 'v2',
            planId: 'plan-1',
            planCode: 'pro-monthly',
            versionNumber: 2,
            status: 'draft',
            effectiveFrom: null,
            publishedAt: null,
            displayName: 'Pro Monthly V2',
            description: 'Draft version',
            billingPeriod: 'month',
            priceCents: 12900,
            currency: 'CNY',
            changeSummary: 'price update',
            benefits: [
              {
                code: 'image-credits',
                name: 'Image credits',
                kind: 'quota',
                quantity: 600,
                unit: 'credit',
              },
            ],
            mediaLibraryPolicy: {
              storageQuotaBytes: 1073741824,
              allowUserUpload: true,
              allowPublicSharing: false,
            },
            permissionCodes: ['page.user_center'],
          },
          scheduledVersion: null,
          history: [],
        },
      }}
    />,
  );

  assert.match(html, /第一次配置会员方案/);
  assert.match(html, /基础设置/);
  assert.match(html, /权限绑定/);
  assert.match(html, /历史版本/);
  assert.match(html, /Pro Monthly V2/);
  assert.match(html, /云资料存储额度/);
  assert.match(html, /允许本地上传图片和视频/);
  assert.match(html, /允许公开分享/);
  assert.match(html, /1024/);
});
