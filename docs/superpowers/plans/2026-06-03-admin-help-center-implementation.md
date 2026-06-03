# Admin Help Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new admin `帮助中心` tab and page that explains module relationships across admin, frontend, agent, and data layers while linking directly to existing admin modules.

**Architecture:** Reuse the existing admin shell and navigation pattern, extract admin nav items into a shared config, and render the help center from static typed metadata. Keep the page server-rendered and use small pure helpers for testable content invariants instead of inventing a content system.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, node:test, react-dom/server

---

### Task 1: Share admin navigation metadata

**Files:**
- Create: `src/features/admin/admin-nav-config.ts`
- Modify: `src/features/admin/admin-nav.tsx`
- Test: `src/features/admin/admin-nav.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import {
  ADMIN_NAV_ITEMS,
  getAdminNavItemByHref,
} from './admin-nav-config';

test('admin nav config exposes help center entry and lookup', () => {
  const helpCenterItem = getAdminNavItemByHref('/admin/help-center');

  assert.ok(helpCenterItem);
  assert.equal(helpCenterItem?.label, '帮助中心');
  assert.equal(ADMIN_NAV_ITEMS.at(-1)?.href, '/admin/help-center');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/features/admin/admin-nav.test.tsx`
Expected: FAIL because `admin-nav-config.ts` and exported config do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import {
  BookOpenText,
  Bot,
  Boxes,
  BrainCircuit,
  FileText,
  Gift,
  Handshake,
  KeyRound,
  LayoutDashboard,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: '仪表盘', icon: LayoutDashboard },
  { href: '/admin/users', label: '用户', icon: Users },
  { href: '/admin/memberships', label: '会员', icon: ShieldCheck },
  { href: '/admin/benefits', label: '权益', icon: Gift },
  { href: '/admin/orders', label: '订单', icon: ReceiptText },
  { href: '/admin/ai-jobs', label: 'AI 任务', icon: Bot },
  { href: '/admin/ai-models', label: 'AI 模型', icon: BrainCircuit },
  { href: '/admin/agent-capabilities', label: 'Agent 能力', icon: Boxes },
  { href: '/admin/partners', label: '合作', icon: Handshake },
  { href: '/admin/content', label: '内容', icon: FileText },
  { href: '/admin/permissions', label: '权限', icon: KeyRound },
  { href: '/admin/settings', label: '设置', icon: Settings },
  { href: '/admin/help-center', label: '帮助中心', icon: BookOpenText },
];

export function getAdminNavItemByHref(href: string) {
  return ADMIN_NAV_ITEMS.find((item) => item.href === href);
}
```

- [ ] **Step 4: Update navigation to use shared config**

```tsx
import { Boxes } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { ADMIN_NAV_ITEMS } from './admin-nav-config';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec tsx --test src/features/admin/admin-nav.test.tsx`
Expected: PASS with the help center nav item and active-state tests all green.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/admin-nav-config.ts src/features/admin/admin-nav.tsx src/features/admin/admin-nav.test.tsx
git commit -m "feat: share admin nav config"
```

### Task 2: Define help center content model and invariants

**Files:**
- Create: `src/features/admin/admin-help-center-config.ts`
- Test: `src/features/admin/admin-help-center-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/features/admin/admin-help-center-config.test.ts`
Expected: FAIL because the config file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
import { ADMIN_NAV_ITEMS, getAdminNavItemByHref } from './admin-nav-config';

export type AdminHelpCenterGroup = { ... };

export const ADMIN_HELP_CENTER_GROUPS: AdminHelpCenterGroup[] = [ ... ];
export const ADMIN_HELP_CENTER_RELATIONSHIPS = [ ... ];
export const ADMIN_HELP_CENTER_LAYERS = [ ... ];

export function getAdminHelpCenterQuickLinks() {
  return ADMIN_NAV_ITEMS.filter((item) =>
    ['/admin/help-center', '/admin/users', '/admin/memberships', '/admin/ai-models'].includes(item.href),
  );
}

export function getAdminHelpCenterRelationshipCount() {
  return ADMIN_HELP_CENTER_RELATIONSHIPS.length;
}
```

- [ ] **Step 4: Fill config with approved scope**

```ts
{
  id: 'operations',
  title: '运营与账户',
  description: '围绕账号生命周期、会员方案、权限绑定和订单处理的后台协作。',
  modules: [
    {
      navHref: '/admin/users',
      role: '管理账号状态、激活工单和客服处理入口。',
      relatedFrontend: ['用户中心', '登录与账号访问'],
      upstream: ['订单状态', '会员方案', '权限绑定'],
      downstream: ['账号可登录状态', '工单处理结果'],
      actions: ['处理激活', '查看状态', '协调订单与会员'],
    },
  ],
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec tsx --test src/features/admin/admin-help-center-config.test.ts`
Expected: PASS with four groups and relationship invariants satisfied.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/admin-help-center-config.ts src/features/admin/admin-help-center-config.test.ts
git commit -m "feat: add admin help center content config"
```

### Task 3: Render the help center page component

**Files:**
- Create: `src/features/admin/admin-help-center-page.tsx`
- Test: `src/features/admin/admin-help-center-page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderToStaticMarkup } from 'react-dom/server';

import { AdminHelpCenterPage } from './admin-help-center-page';

test('admin help center page renders overview, groups, and quick links', () => {
  const html = renderToStaticMarkup(<AdminHelpCenterPage />);

  assert.match(html, /帮助中心/);
  assert.match(html, /系统总览/);
  assert.match(html, /运营与账户/);
  assert.match(html, /进入模块/);
  assert.match(html, /关键链路/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/features/admin/admin-help-center-page.test.tsx`
Expected: FAIL because the page component does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ADMIN_HELP_CENTER_GROUPS,
  ADMIN_HELP_CENTER_LAYERS,
  ADMIN_HELP_CENTER_RELATIONSHIPS,
} from './admin-help-center-config';

export function AdminHelpCenterPage() {
  return (
    <div className="space-y-6">
      <section>{/* heading + overview */}</section>
      <section>{/* layers */}</section>
      <section>{/* grouped cards */}</section>
      <section>{/* key relationships */}</section>
    </div>
  );
}
```

- [ ] **Step 4: Refine markup to match admin patterns**

```tsx
<Card className="border-neutral-200 bg-white shadow-sm">
  <CardHeader>
    <CardTitle className="text-base font-semibold">系统总览</CardTitle>
  </CardHeader>
  <CardContent className="grid gap-3 lg:grid-cols-4">
    {ADMIN_HELP_CENTER_LAYERS.map((layer) => (
      <div key={layer.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        ...
      </div>
    ))}
  </CardContent>
</Card>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec tsx --test src/features/admin/admin-help-center-page.test.tsx`
Expected: PASS with overview, grouped sections, and quick-link copy present in rendered HTML.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/admin-help-center-page.tsx src/features/admin/admin-help-center-page.test.tsx
git commit -m "feat: add admin help center page component"
```

### Task 4: Add the routed admin page

**Files:**
- Create: `src/app/admin/(console)/help-center/page.tsx`
- Modify: `src/features/admin/admin-nav.tsx`
- Test: `src/features/admin/admin-nav.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
test('module nav item matches help center route', () => {
  assert.equal(isAdminNavItemActive('/admin/help-center', '/admin/help-center'), true);
  assert.equal(isAdminNavItemActive('/admin/help-center', '/admin/help-center/overview'), true);
  assert.equal(isAdminNavItemActive('/admin/help-center', '/admin/users'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec tsx --test src/features/admin/admin-nav.test.tsx`
Expected: FAIL because help center route is not yet represented in the active-state coverage.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { AdminHelpCenterPage } from '@/features/admin/admin-help-center-page';

export const dynamic = 'force-dynamic';

export default function AdminHelpCenterRoute() {
  return <AdminHelpCenterPage />;
}
```

- [ ] **Step 4: Ensure nav renders the new item automatically**

```tsx
{ADMIN_NAV_ITEMS.map((item) => {
  const Icon = item.icon;
  ...
})}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec tsx --test src/features/admin/admin-nav.test.tsx`
Expected: PASS with the new help center route coverage.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/admin/(console)/help-center/page.tsx' src/features/admin/admin-nav.tsx src/features/admin/admin-nav.test.tsx
git commit -m "feat: add admin help center route"
```

### Task 5: Verify end-to-end integration at the repository layer

**Files:**
- Verify: `src/features/admin/admin-nav-config.ts`
- Verify: `src/features/admin/admin-help-center-config.ts`
- Verify: `src/features/admin/admin-help-center-page.tsx`
- Verify: `src/app/admin/(console)/help-center/page.tsx`

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec tsx --test src/features/admin/admin-nav.test.tsx src/features/admin/admin-help-center-config.test.ts src/features/admin/admin-help-center-page.test.tsx`
Expected: PASS with 0 failures.

- [ ] **Step 2: Run repository validation**

Run: `pnpm validate`
Expected: exit 0.

- [ ] **Step 3: Run build for wiring verification**

Run: `pnpm build`
Expected: exit 0 with Next.js production build completing.

- [ ] **Step 4: Browser-check the page**

Run: `pnpm dev:pw`
Then open `http://127.0.0.1:4000/admin/help-center` and verify:

- `帮助中心` appears in left nav.
- Page shows four overview layers.
- Each module card has an `进入模块` action.
- Mobile-width layout stacks cards vertically without overlap.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/(console)/help-center/page.tsx src/features/admin/admin-nav-config.ts src/features/admin/admin-help-center-config.ts src/features/admin/admin-help-center-config.test.ts src/features/admin/admin-help-center-page.tsx src/features/admin/admin-help-center-page.test.tsx src/features/admin/admin-nav.test.tsx docs/superpowers/plans/2026-06-03-admin-help-center-implementation.md
git commit -m "feat: add admin help center"
```

