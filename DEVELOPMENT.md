# DEVELOPMENT - Current Repository Guide

This is the first document to read for every task. It describes the current repository shape, workflow, commands, ownership rules, and document routing. `AGENTS.md` intentionally stays concise; detailed execution guidance belongs here or in focused docs.

## 1. Current Baseline

This repository is currently a root-level **Next.js App Router** application.

Core stack:

- Next.js 16, React 19, TypeScript.
- Tailwind CSS v4 with shadcn/Radix UI primitives.
- PostgreSQL + Drizzle ORM.
- Server-side auth, account lifecycle, admin authorization, repositories, audit, and agent runtime under `src/server`.
- OpenSpec/Superpowers planning artifacts under `openspec/` and `docs/superpowers/`.

This checkout is WebUI-first. The sibling repository `../lingwei` is the reference implementation for the desktop app and deeper agent architecture design; use it as an external reference, not as this repository's current source layout.

## 2. Source Layout

Use CodeGraph first for current source discovery, then `rg` for text search.

Current top-level buckets:

- `src/app`: App Router pages, layouts, middleware-facing routes, and API route handlers.
- `src/app/admin`: admin console routes.
- `src/app/api`: API route handlers. These are boundary adapters and must validate input before calling server/domain code.
- `src/features`: feature UI and client-side feature helpers.
- `src/components/ui`: shared shadcn/Radix UI primitives.
- `src/lib`: shared client/server utilities that are not domain owners.
- `src/server/auth`: account lifecycle, session, admin auth, work orders, and auth policy.
- `src/server/repositories`: Drizzle-backed persistence access. Query details belong here.
- `src/server/db`: schema, DB client, migration, and seed entrypoints.
- `src/server/agent`: agent runtime and capability resolution.
- `src/server/audit`: audit event behavior.
- `drizzle/`: generated migrations and Drizzle metadata.
- `docs/superpowers`: approved specs, plans, and verification notes.
- `openspec/changes`: active and archived change records.

## 3. Commands

Run from repository root.

- Install dependencies: `pnpm install`
- Dev server: `pnpm dev`
- Production build: `pnpm build`
- Start built app: `pnpm start`
- Lint: `pnpm lint`
- Quiet lint for CI-style checks: `pnpm lint:build`
- Type-check: `pnpm ts-check`
- Default validation: `pnpm validate`
- Generate Drizzle migrations: `pnpm db:generate`
- Run migrations: `pnpm db:migrate`
- Seed data: `pnpm db:seed`

There is currently no repository-level `pnpm pre-commit` script. If a workflow asks for it, use the strongest available local equivalent: usually `pnpm validate`, plus `pnpm build`, DB commands, or targeted tests according to risk.

## 4. Required Task Triage

Every user request must be classified and announced as **Small** or **Large**.

Small:

- Localized, low-risk, non-structural.
- No runtime ownership ambiguity.
- No schema/API/auth/session/admin/security/UI information architecture change.
- Use direct implementation and targeted verification.

Large:

- New feature, meaningful behavior change, or refactor.
- Auth/session/account lifecycle/admin permission/security change.
- Database schema, migration, repository contract, or durable data semantics change.
- Cross-boundary behavior across page/API/domain/repository/middleware/client state.
- User-visible UI or information architecture change.
- Any state ownership, transition, recovery, or authority ambiguity.

For Large work, use the repository planning workflow already present in `openspec/` and `docs/superpowers/`. Documentation-only or prompt-only changes may use a lightweight direct path if they do not alter runtime behavior.

## 5. Engineering Principles

### Reuse Before Creating

Before adding a new component, route helper, repository method, domain service, or utility:

1. Search CodeGraph for existing symbols and call sites.
2. Search with `rg` when exact text or route names matter.
3. Reuse or extend existing boundaries unless a new abstraction has a clear owner.

### State Ownership

For persisted, restored, synced, or cross-layer state, define:

- State name.
- Owner.
- Write entry.
- Allowed transitions.
- Restart/source-of-truth behavior.
- What is derived UI only.

Multiple writers for the same durable truth are a design risk, not an implementation detail.

### Boundary Rules

- UI renders and initiates actions; it does not own durable business truth.
- API routes validate input and translate transport concerns.
- Server domain modules own business policy.
- Repositories own query shape and persistence details.
- Database schema owns durable constraints.
- Middleware must stay Edge-safe and must not import Node-only modules.
- Admin guards and auth/session checks must fail closed in production.

### Schema And Migrations

- Do not manually edit `pnpm-lock.yaml`.
- Do not manually edit generated Drizzle metadata unless the toolchain explicitly requires it and the reason is documented.
- Schema changes start in `src/server/db/schema.ts`.
- Generate migrations with `pnpm db:generate`.
- Check old-data compatibility, nullability, default values, and idempotent seed behavior.

### UI And Product Surfaces

- Public product pages live under `src/app/*` with feature data from `src/features/public` or server/domain APIs.
- Admin console screens are operational surfaces: dense, scannable, task-oriented, and permission-aware.
- Use existing `src/components/ui` primitives and established feature components.
- Avoid hardcoded behavior in route files when a feature/domain module should own it.
- For user-visible UI/information architecture changes, research at least one mature design reference before implementation and record the transferable principle.

## 6. Pre-Coding Checks For Non-Trivial Work

Before implementation, write down enough of the following to guide the change:

- Problem class and whether it has mature external practice.
- Existing owner and current call chain.
- Mutable state table.
- 1-3 invariants.
- Boundary graph: UI/page/API/domain/repository/database/middleware.
- Verification layer choice.

If ownership, authority, or security semantics are unclear, pause and align before coding.

## 7. Risk Checklist

For Large or runtime-risk work, explicitly check:

- Async gaps, duplicate submissions, and out-of-order responses.
- Auth/session expiry, cookie behavior, admin role checks, and fail-closed production behavior.
- Middleware Edge compatibility.
- Input validation at API/server-action boundaries.
- Database constraints, migrations, rollback/old-data compatibility, and seed idempotence.
- Repository transaction boundaries and partial failure behavior.
- UI loading, error, empty, unauthorized, and success states.
- Sensitive mutation auditability.

## 8. Research Method

When the problem likely has mature industry practice, use `docs/development/REFERENCE_RESEARCH_METHOD.md`.

Project-specific reference:

- `../lingwei`: sibling implementation repository for desktop app behavior and agent architecture design. Consult it when WebUI work needs to align with desktop behavior, agent lifecycle, capability routing, or control-surface semantics.

Default research-trigger examples:

- Auth, session, cookies, password reset, admin permissions.
- Work-order approval flows, audit trails, account lifecycle.
- Search/filter/table/admin console patterns.
- Payment/order/job queues and status transitions.
- AI agent runtime, capability resolution, retry/recovery.
- User-visible navigation, forms, dashboards, or information architecture.

Summarize findings as:

`Industry consensus -> Transferable principle -> This repository's constraints -> Local design`

## 9. Verification Strategy

Use the lowest meaningful layer first.

- Pure domain logic: targeted unit tests when present, or focused type-safe module checks.
- Type/lint baseline: `pnpm validate`.
- App wiring and server/runtime compatibility: `pnpm build`.
- Database changes: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, plus focused repository checks.
- UI behavior: run `pnpm dev` or built app and verify in browser. Use screenshots for layout-sensitive work.

If a command cannot run because of missing infrastructure such as `DATABASE_URL`, report the exact blocker and still run non-dependent checks.

## 10. Debugging

When a validation, build, migration, or test command fails:

1. Reproduce with the narrowest command.
2. Identify the failing layer: type, lint, build, API boundary, domain, repository, database, UI.
3. Inspect the owner module before patching callers.
4. Add or update a reusable asset when fixing a real bug.

If no existing debugging doc covers the problem, add a short case note only when it will help future work.

## 11. Documentation Map

- Agent directives: `AGENTS.md`
- Current development guide: `DEVELOPMENT.md`
- Reference research method: `docs/development/REFERENCE_RESEARCH_METHOD.md`
- Approved specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`
- Verification records: `docs/superpowers/verification/`
- OpenSpec changes: `openspec/changes/`
- Current package scripts: `package.json`
- Database schema: `src/server/db/schema.ts`

## 12. Handoff

Final handoff should include:

- Files changed.
- Verification commands run and results.
- Commands not run and why.
- Any residual risk or follow-up that matters.
