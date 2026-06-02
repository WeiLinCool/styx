# Admin Content Homepage Closure Verification

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm exec tsx --test src/features/public/home-content.test.ts src/server/repositories/content.test.ts src/app/api/admin/content/route.test.ts` | PASS | 12 tests passed. Covered homepage metadata validation, public published-row filtering, admin mutation value normalization, status transitions, and admin route body parsing. |
| `pnpm validate` | FAIL | `lint:build` did not report task-specific errors before `ts-check` failed. `ts-check` is blocked by existing `user-points-referral-checkin` active-change test typing issues in `src/server/db/schema.points.test.ts` and `src/server/repositories/admin-mutations.points.test.ts`. No `admin-content-homepage-closure` files appear in the failure output after local fixes. |
| `pnpm build` | PASS | Build completed and route table includes dynamic `/home` plus separate `/api/admin/content/**` admin mutation routes. Next warned about multiple lockfiles because the worktree sits under the main repository; no lockfile changes were committed. |
| `openspec validate admin-content-homepage-closure --strict` | PASS | Change is valid. |

## Browser Verification

- `/home` fallback: Not run. The production build verifies `/home` compiles as a dynamic server-rendered route using `getPublicHomepageContent`.
- `/admin/content` actions: Not run. Local browser verification was skipped because the isolated worktree does not have confirmed local admin/database session setup.
- Draft does not affect public homepage: Covered by repository tests through `mapPublishedHomepageRows`, which ignores draft rows even when `publishedAt` exists.
- Published content affects public homepage: Covered by `mergeHomepageBlocks` test overlaying valid `home.hero` content over defaults.
- Draft/archive removes public content: Draft filtering is covered by focused tests; archived status is excluded by the same `status === 'published'` public-row filter.

## Invariants Checked

- Public reads use only rows with `status = published` and non-null `publishedAt`.
- Draft edits do not alter the public homepage because `/home` calls `getPublicHomepageContent` and never calls `/api/admin/content/**`.
- Invalid or unavailable content falls back to static defaults through `mergeHomepageBlocks(defaultHomepageContent, ...)`.
- Admin routes validate input with zod and require admin session before repository writes.
- User/public content read path is separated from management APIs: public rendering uses server-side `getPublicHomepageContent`; admin mutation routes live under `/api/admin/content/**`.

## Blockers

- `pnpm validate` remains blocked by pre-existing type errors in the separate `user-points-referral-checkin` active change:
  - `src/server/db/schema.points.test.ts`
  - `src/server/repositories/admin-mutations.points.test.ts`
- Browser verification needs a local admin/database session. The build confirms route wiring, but live create/publish/unpublish behavior was not browser-click verified in this run.
