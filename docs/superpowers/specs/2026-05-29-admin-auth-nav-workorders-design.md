---
archived-with: 2026-05-29-admin-auth-nav-workorders
status: final
status: final
---
# Admin Auth Nav Workorders Design

## Summary

This change upgrades the admin console in three tightly related areas: operator auth actions in the shell, route-aware left navigation, and a real queue-management surface for activation binding work orders. The implementation should stay close to the current architecture by reusing existing auth endpoints, Next.js route state, and repository-backed admin page composition.

## Scope

- Add explicit login/logout interactions to the admin shell and development access-denied state.
- Fix left-nav active item behavior across admin routes.
- Replace the flat activation work-order list on the users page with a status-tabbed, paginated queue.
- Extend the work-order status model and admin data adapters to support `pending`, `processing`, `closed`, and `archived`.

## Architecture

The admin shell remains server-rendered at the layout boundary, but interactive auth controls move into small client components that call existing auth APIs and refresh the route. Navigation becomes a pathname-aware client component. The users page continues to fetch data on the server, but work orders are loaded through a query-param-aware repository contract that returns tab counts, paginated rows, and compatible mappings from legacy statuses.

## Components

### 1. Admin auth controls

- Add a focused client component under `src/features/admin/` for auth actions.
- In the authenticated state, render a logout button in the header next to session metadata.
- In the development-only denied state, render a lightweight login form or shortcut that can call `/api/auth/login` using the existing phone-based API contract.

### 2. Route-aware navigation

- Convert `src/features/admin/admin-nav.tsx` to a client component.
- Compute active state from `usePathname()`.
- Keep `/admin` exact-only, while other routes match exact or nested paths.

### 3. Work-order queue model

- Introduce an admin-facing queue status type distinct from the old approval outcomes.
- Preserve compatibility by mapping existing stored statuses:
  - `pending` -> `pending`
  - `approved` / `rejected` -> `closed`
  - `expired` -> `archived` or `closed`, depending on the chosen compatibility rule in implementation
- Add closure outcome metadata so the UI can still tell whether a closed work order was approved or rejected.

### 4. Users page queue surface

- Split the work-order block out of `src/app/admin/users/page.tsx` into a dedicated feature component if needed.
- Read `status` and `page` search params server-side.
- Render status tabs, counts, rows, and pagination controls above the existing user table.
- Add operator actions for moving to processing, approving/rejecting to closure, and archiving closed items.

## Data Contract

Recommended repository response shape:

```ts
type AdminWorkOrderQueueStatus = 'pending' | 'processing' | 'closed' | 'archived';

type AdminActivationWorkOrderListItem = {
  id: string;
  code: string;
  queueStatus: AdminWorkOrderQueueStatus;
  outcome: 'approved' | 'rejected' | 'expired' | null;
  userId: string;
  userLabel: string;
  deviceSummary: string;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
};

type AdminActivationWorkOrderQueue = {
  counts: Record<AdminWorkOrderQueueStatus, number>;
  page: number;
  pageSize: number;
  total: number;
  status: AdminWorkOrderQueueStatus;
  records: AdminActivationWorkOrderListItem[];
};
```

## Testing

- Add unit coverage for queue-status mapping from persisted rows.
- Add UI/component coverage for nav active-state logic if there is an existing pattern; otherwise keep logic small and test the helper.
- Add repository tests for counts, paging defaults, and filtering.
- Run targeted node tests for affected repositories/domain logic plus `pnpm run validate`.

## Open Choices Resolved

- The queue tabs use `待处理 / 处理中 / 已办结 / 已归档`.
- “办结之后就是归档了” is interpreted as an explicit operational path where closed items are the completed set and archived items are the historical set after archive action.
