# Lingwei Repository Agent Standard

This file is the concise, non-negotiable execution standard for agents working in this repository. Detailed workflow, commands, current architecture, and doc routing live in `DEVELOPMENT.md`.

## 1. First Action

Before acting on every task:

1. Read `DEVELOPMENT.md`.
2. Set the working directory to the repository root.
3. Use CodeGraph or current source inspection to confirm the real structure before relying on memory or old docs.
4. Classify the request as **Small** or **Large** and tell the user.

## 2. Current Repository Baseline

The current product is a root-level **Next.js App Router** web application using:

- `src/app` for routes, route handlers, layouts, and pages.
- `src/features` for product/admin/account feature UI.
- `src/components/ui` for shadcn/Radix UI primitives.
- `src/server` for auth, repositories, DB access, agent runtime, and audit logic.
- PostgreSQL + Drizzle for persistence.

This repository is WebUI-first. Use the sibling `../lingwei` repository only as the reference implementation for the desktop app and deeper agent architecture design.

## 3. Small vs Large

### Small

Localized, low-risk, non-structural work.

Proceed directly, run targeted verification, and report what risk was checked.

### Large

Any of the following upgrades the task to Large:

- New feature or meaningful behavior change.
- Auth, session, account lifecycle, admin permission, DB schema, migration, payment/order, agent runtime, or persistence change.
- Cross-boundary change between page, API route, server domain, repository, database, middleware, or client state.
- User-visible UI or information architecture change.
- Ambiguous ownership, state transitions, security semantics, or recovery behavior.

Use the repository's documented planning workflow from `DEVELOPMENT.md` before implementation. For documentation-only or prompt-only edits, a lightweight direct path is acceptable if it touches no runtime behavior.

## 4. Engineering Gates

Before non-trivial implementation:

- Identify mutable state, owner, write entry, and source of truth.
- Write 1-3 invariants before enumerating scenarios.
- Search for existing abstractions before creating new ones.
- If the problem has mature industry practice, research it using `docs/development/REFERENCE_RESEARCH_METHOD.md`.
- For user-visible UI or information architecture changes, study at least one mature design reference first.
- If fixing a real bug, leave a reusable asset: test, assertion, rule, or documentation update.

## 5. Boundaries

- Route handlers and server actions validate input before calling domain code.
- UI calls feature/domain APIs; it does not own durable business truth.
- Repositories own query shape and persistence details.
- Auth/session/admin authorization must fail closed in production.
- Middleware must stay Edge-safe; do not import Node-only modules there.
- Do not manually edit lock files or generated code. Use the proper package or generation command.

## 6. Verification

Use the lowest meaningful layer first:

- Pure logic: targeted unit tests or `pnpm validate`.
- Type/lint safety: `pnpm validate`.
- Build/runtime wiring: `pnpm build`.
- Database changes: `pnpm db:generate`, `pnpm db:migrate`, and focused repository/domain checks.
- User-visible UI: browser verification and screenshots when layout/interaction risk matters.

Report any command not run and why.
