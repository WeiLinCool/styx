export type PermissionResourceType = 'menu' | 'page' | 'action' | 'api';

export type PermissionResourceDefinition = {
  code: string;
  name: string;
  resourceType: PermissionResourceType;
  module: string;
  description: string;
  routePattern?: string;
  actionKey?: string;
  dependsOn?: string[];
  recommendedWith?: string[];
};

export const permissionCatalog: PermissionResourceDefinition[] = [
  {
    code: 'menu.user_center',
    name: '用户中心菜单',
    resourceType: 'menu',
    module: 'navigation',
    description: '允许显示用户中心入口。',
    routePattern: '/user-center',
    dependsOn: ['page.user_center'],
  },
  {
    code: 'page.user_center',
    name: '用户中心页面',
    resourceType: 'page',
    module: 'user-center',
    description: '允许访问用户中心页面。',
    routePattern: '/user-center',
  },
  {
    code: 'action.user_center.copy_invite_code',
    name: '复制邀请码按钮',
    resourceType: 'action',
    module: 'user-center',
    description: '允许在用户中心复制邀请码。',
    actionKey: 'copy_invite_code',
    dependsOn: ['page.user_center'],
    recommendedWith: ['api.user.invites.read'],
  },
  {
    code: 'api.user.invites.read',
    name: '读取邀请信息接口',
    resourceType: 'api',
    module: 'user-center',
    description: '允许读取邀请码和邀请摘要信息。',
    routePattern: '/api/auth/me',
  },
  {
    code: 'api.user.points.checkin',
    name: '签到积分接口',
    resourceType: 'api',
    module: 'points',
    description: '允许调用用户签到积分接口。',
    routePattern: '/api/user/points/checkin',
  },
  {
    code: 'api.user.media_assets.list',
    name: '媒体资产列表接口',
    resourceType: 'api',
    module: 'media-assets',
    description: '允许读取用户媒体资产列表。',
    routePattern: '/api/user/media-assets',
  },
];
