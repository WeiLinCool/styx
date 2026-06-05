# Admin Docs Operations Redesign Verification

Date: 2026-06-05

## Commands

- `pnpm exec tsx --test src/features/admin/admin-doc-blocks.test.ts` - RED, then PASS after adding `createVisibleDocBlocks`.
  - Initial failure: `createVisibleDocBlocks` was missing.
  - Final coverage verifies empty article blocks fall back to one visible starter `rich_text` block.
- `pnpm exec tsx --test src/features/admin/admin-doc-blocks.test.ts src/features/admin/admin-doc-block-editor.test.tsx src/features/admin/admin-docs-module.test.tsx src/features/admin/admin-doc-categories-manager.test.tsx src/server/repositories/docs.test.ts` - PASS
  - 19/19 focused feature and repository tests passed.
  - Covered admin docs list filtering, category mutation constraints, category manager rendering, block adapters, empty-block fallback, and explicit block editor add-button labels.
- `cd src/app/api/admin/docs/categories/[categoryId] && node --import tsx --test route.test.ts` - PASS
  - 3/3 category route tests passed.
  - Covered category mutation body parsing and the DELETE request-body protection regression.
- `pnpm validate` - PASS
  - `ts-check` passed.
  - `lint:build` passed.
  - Note: one earlier `pnpm validate` run failed while `pnpm build` was running in parallel because `.next/types/validator.ts` temporarily could not resolve generated `./routes.js`; rerunning `pnpm validate` after the build completed passed.
- `pnpm build` - PASS
  - Next.js production build completed.
  - Admin docs pages and API routes were included in the route manifest.
- `rg -n 'window\.location\.reload|<a href="/admin|href=\{`/admin|href=\{"/admin|内容块 JSON|只读巡检|fake|disabled fake' src/features/admin src/app/admin src/app/api/admin/docs src/server/repositories/docs.ts` - PASS
  - No remaining hard reload, raw internal admin anchor, raw JSON editor, or read-only category inspection markers were found. The only `/admin/docs` dynamic link match uses `next/link`.

## Runtime Checks

- Existing local dev server on `http://localhost:3000` was identified as `next-server (v16.1.1)`.
- `curl -i -sS http://localhost:3000/admin/docs` - returned `200 OK` HTML/RSC payload and included the docs filter toolbar/table payload.
- `curl -i -sS http://localhost:3000/admin/docs/categories` - returned `200 OK` HTML/RSC payload and included the category manager page payload.
- `curl -i -sS http://localhost:3000/admin/docs/articles/new` - returned `200 OK` HTML/RSC payload and included a starter `rich_text` block for new articles.
- Unauthenticated admin requests still resolve through the admin layout and include a `NEXT_REDIRECT` boundary to `/admin/login`, as expected for protected pages.

## Blocked Checks

- In-app Browser could open `http://localhost:3000/admin/docs/categories` and `http://localhost:3000/admin/docs/articles/new`, but both pages redirected to `http://localhost:3000/admin/login`.
- Click-level UI verification for category create/edit/delete and article block buttons was not run because no authenticated admin browser session or credentials were available in this environment.
- Starting a separate dev server was blocked by an existing `.next/dev/lock`; this was not modified to avoid disrupting the user's existing local server.
