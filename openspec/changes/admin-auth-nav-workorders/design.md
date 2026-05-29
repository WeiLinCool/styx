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
