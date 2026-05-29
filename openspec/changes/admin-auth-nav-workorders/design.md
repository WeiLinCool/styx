## Context

The codebase already has server routes for `/api/auth/login` and `/api/auth/logout`, cookie-backed session resolution in `src/server/auth/session.ts`, and admin gating in `src/server/auth/guards.ts`. What is missing is the management-console interaction around those primitives. The shell renders session metadata but does not provide actions, and the development access-denied view is informational only.

The left navigation is defined in `src/features/admin/admin-nav.tsx` as a static list of links whose visual active state is hard-coded for `/admin`. The route transition works, but the highlighted item does not follow the actual pathname.

The activation work-order data model is currently approval-centric. `src/server/auth/activation-work-orders.ts` uses `pending | approved | rejected | expired`, while `src/server/repositories/admin-activation-work-orders.ts` simply returns the latest 20 rows. The user module page then renders them as a single block above the user table. That does not support operator queue management.

## Goals / Non-Goals

**Goals:**

- Add a practical admin entry/exit interaction that uses the existing auth routes and reflects session state in the shell.
- Make admin navigation styling route-aware for all admin modules.
- Introduce operator-facing work-order lifecycle tabs: `待处理`, `处理中`, `已办结`, `已归档`.
- Support paginated loading and status counts for activation binding work orders.
- Preserve Chinese operator-facing copy across the new admin interactions.

**Non-Goals:**

- No redesign of the public user login modal.
- No full RBAC rewrite or admin invitation flow.
- No generic pagination framework for every admin module in this change.
- No retrospective migration of unrelated order or AI task workflows to the same tab model.

## Approaches Considered

1. **Minimal UI-only patch**
   - Add a logout button, use pathname matching for nav, and client-filter the existing work-order list.
   - Pros: smallest change set.
   - Cons: does not satisfy the requested lifecycle model, pagination, or archive behavior because the server model remains approval-centric.

2. **Recommended: targeted admin workflow upgrade**
   - Keep existing auth/session primitives, add shell-level auth actions, make nav pathname-aware, and upgrade activation work orders to an admin queue model with server-side status filtering and pagination.
   - Pros: satisfies the requested operator workflow without broad unrelated refactoring; aligns with current repository-driven admin architecture.
   - Cons: requires status model and API changes across UI and server code.

3. **Full admin workflow platform refactor**
   - Introduce shared queue abstractions, centralized admin filter state, and reusable paginated data loaders for all modules.
   - Pros: more uniform long term.
   - Cons: too large for the scope; delays delivery and mixes unrelated architecture work into a focused admin fix.

## Decisions

1. **Reuse the existing login/logout routes instead of inventing a separate admin auth API.**
   - The backend already creates and clears the `nfai_auth_token` cookie. The admin shell should call those endpoints directly and then refresh the route.

2. **Make the admin nav a client component that derives active state from `usePathname()`.**
   - This is the narrowest reliable way to align visual state with Next.js route transitions.

3. **Promote activation work orders from approval statuses to operator statuses.**
   - The admin management surface needs `pending`, `processing`, `closed`, and `archived`. Approval/rejection becomes audit metadata or a closure outcome rather than the top-level operator status name.

4. **Use server-side pagination and status filtering for work orders.**
   - The user module should request a tab payload with counts plus a page slice. This keeps archive history scalable and avoids pushing an unbounded list into the page.

5. **Treat closure as the precursor to archival.**
   - Operators work active items in `待处理` and `处理中`, complete them into `已办结`, and then move them to `已归档` for history management. This keeps “办结之后就是归档了” explicit in the model.

## Data / Flow Design

### Admin auth shell

1. `src/app/admin/layout.tsx` still resolves admin access with `requireAdmin()`.
2. If access is denied in development, the fallback panel gains an inline login action and clear guidance.
3. If access is granted, `AdminHeader` renders the current operator plus a sign-out action that posts to `/api/auth/logout` and refreshes.

### Route-aware navigation

1. `AdminNav` reads `usePathname()`.
2. Each nav item is active when the pathname equals the item href or is nested under it, with `/admin` treated specially so it only matches the dashboard root.
3. Active and inactive visual states are derived from that match result.

### Work-order queue lifecycle

```
pending -> processing -> closed -> archived
```

- `pending`: newly created, not yet taken in hand by support.
- `processing`: support is actively reviewing the work order.
- `closed`: support completed handling; outcome metadata records whether it was approved or rejected.
- `archived`: historical queue after closure.

Approval and rejection actions should no longer leave the row in terminal statuses named `approved` or `rejected`. Instead they close the work order with closure metadata and, when required, activate the account. Archive is a separate explicit state for historical management.

### Page composition

1. `src/app/admin/users/page.tsx` reads query params for work-order tab and page.
2. A new users-page work-order module renders tab counts, queue rows, pagination controls, and row actions.
3. The existing user table remains below it and continues using the current admin user repository.

## Risks / Trade-offs

- **Status migration risk**: current persisted rows may contain `approved/rejected/expired`; the implementation must define a mapping into the new operator statuses for compatibility.
- **Auth UX mismatch**: the existing login API expects phone-based payloads; the admin login entry should either reuse that minimal flow or remain clearly development-oriented until a dedicated operator credential flow exists.
- **Pagination complexity**: adding query-param-driven tabs/pages touches both server page composition and client navigation, so tests should cover defaulting and invalid params.
