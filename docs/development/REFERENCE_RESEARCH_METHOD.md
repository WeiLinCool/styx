# Reference-Driven Engineering

Use this method when a task belongs to a problem class that mature products, frameworks, libraries, or teams have probably already solved. The goal is not to copy external implementation. The goal is to turn external commitments, ownership models, invariants, fallbacks, and trade-offs into a local design that fits this repository.

Current repository context: root-level Next.js App Router application, React UI, PostgreSQL/Drizzle persistence, server-side auth/admin/domain/repository boundaries, and operational admin surfaces.

Project-specific reference implementation: `../lingwei` is the sibling repository for the desktop app and deeper agent architecture design. Use it as a first-party reference when this WebUI repository needs to align with desktop behavior, agent lifecycle, capability routing, or control-surface semantics.

## 1. When Research Is Required

Default to research before design when the task involves any of:

- Auth, sessions, cookies, password reset, account activation, admin authorization, or audit.
- Database schema, migration, repository contracts, durable state, or recovery.
- Admin console workflows: tables, filters, work queues, approval/rejection, status transitions, detail panels.
- User-visible navigation, forms, dashboards, onboarding, information architecture, or content hierarchy.
- AI agent runtime, capability selection, job queues, retry, fallback, or billing/usage semantics.
- Search, cache, sync, import/export, rate limiting, idempotency, background jobs, or webhooks.
- A local patch that fixes one case while making adjacent cases harder to explain.

Quick test: if the issue is something other teams have likely shipped, broken, and documented, research it first.

## 2. Source Priority

Prefer high-signal primary or near-primary sources:

1. Product docs, help centers, official specifications, security guidance.
2. Official examples, source code, tests, RFCs, architecture notes.
3. Issues, discussions, changelogs, maintainer comments explaining trade-offs or pitfalls.
4. First-party reference implementation in `../lingwei` when desktop app or agent architecture behavior matters.
5. This repository's existing source, tests, specs, and plans.

Avoid designing from random snippets, SEO blogs, or context-free examples unless they are only used to discover better primary sources.

## 3. Research Output

Do not collect pages for volume. For each useful reference, extract only:

- Promise: what behavior is committed to users or callers.
- State owner and authority owner.
- 1-3 invariants.
- Fallback or manual override behavior.
- Trade-off, limitation, or reason not to copy directly.

Suggested note format:

```md
Reference: <name / URL / file>
- Promise:
- State owner:
- Authority owner:
- Invariants:
- Fallback / override:
- Transferable principle:
- Not directly copied because:
```

## 4. Translate Before Designing

A local proposal must show this chain:

`Industry consensus -> Transferable principle -> Repository constraints -> Local design`

Repository constraints usually include:

- App Router routing and server/client component boundaries.
- API route validation.
- `src/server/auth` ownership of account/session/admin policy.
- `src/server/repositories` ownership of query details.
- Drizzle schema and migration constraints.
- Edge-safe middleware limitations.
- Existing feature UI and shadcn/Radix primitives.
- Current specs and plans under `docs/superpowers` and `openspec`.

## 5. Conservative Defaults

For automation or heuristics such as auto-detect, auto-approve, auto-retry, auto-recover, capability selection, or status inference:

- Switch state only with high confidence.
- Keep behavior stable when ambiguous.
- Preserve explicit user/admin override where appropriate.
- Make retries idempotent where side effects are possible.
- Prefer auditable state transitions over hidden local flags.

## 6. Common Local Patterns

### Auth And Account Lifecycle

Research should clarify:

- Session/cookie promises.
- Token hashing and expiry.
- Fail-closed production behavior.
- Admin authority boundaries.
- Audit requirements for sensitive mutations.

Local design should land policy in `src/server/auth`, persistence in `src/server/repositories`, and validation at API boundaries.

### Admin Workflows

Research should clarify:

- Queue/table density and scannability.
- Status transition rules.
- Bulk versus single-item operations.
- Empty/error/loading/unauthorized states.
- Audit and undo/fallback expectations.

Local design should use feature components under `src/features/admin` and keep route files thin.

### Database And Persistence

Research should clarify:

- Durable invariants and uniqueness.
- Migration compatibility.
- Idempotent writes and seed behavior.
- Transaction boundaries.
- Partial failure handling.

Local design starts with `src/server/db/schema.ts`, uses generated Drizzle migrations, and avoids leaking query details outside repositories.

### UI And Information Architecture

Research should clarify:

- Mature product conventions for the task.
- Navigation model.
- Form validation and recovery.
- Dense operational layout versus marketing layout.
- Accessibility and responsive behavior.

Local design should reuse `src/components/ui`, existing feature components, and browser verification for layout-sensitive changes.

## 7. Verification

Tie verification to the learned invariant:

- Unit or focused module checks for pure policy, normalization, and state transitions.
- API/contract checks for validation and auth boundaries.
- Repository/database checks for constraints, migrations, and idempotency.
- Build checks for App Router/server/client compatibility.
- Browser checks for user-visible UI behavior.

If infrastructure such as `DATABASE_URL` is unavailable, record the blocker and still run checks that do not depend on it.

## 8. Assetization

Before handoff, convert the learning into at least one reusable asset:

- Test or focused regression check.
- Rule in `DEVELOPMENT.md` or a topic doc.
- Owner/invariant note in a spec, plan, or verification record.
- Review checklist item.
- Small code abstraction that removes duplicated interpretation.

Research that only remains in chat is incomplete.

## 9. Anti-Patterns

- Waiting for the user to explicitly ask for references.
- Copying implementation shape without copying the promise or invariant.
- Importing external patterns that violate local boundaries.
- Designing auth/security/database behavior from UI convenience.
- Adding hidden state instead of clarifying owner and transition rules.
- Treating generated migrations or lock files as hand-editable prose.
- Shipping UI information architecture without checking mature design references.
