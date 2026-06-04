# Sitewide UI Theme Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a strong sitewide UI system so all current and future pages support `light / dark / system` themes through shared tokens and shared component/page-shell rules.

**Architecture:** First codify the governance rules in shared tokens and shared UI/container primitives, then adapt the highest-impact user AI tool pages and admin business pages to those primitives. Finish with repository validation and a residual hard-coded-color scan so the new system is both documented and actually enforced in code.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, `next-themes`, shadcn/Radix UI, Sonner

---

## File Structure

- Modify: `src/app/globals.css`
  - Expand semantic token coverage to include success/warning/info surfaces and shared layer conventions.
- Modify: `src/components/ui/*` as needed
  - Normalize shared component visuals onto semantic tokens where gaps remain.
- Modify: `src/features/admin/module-page.tsx`
  - Use as the canonical admin shared module surface.
- Modify: `src/features/admin/*.tsx`
  - Bring high-impact admin business modules and dialogs onto the shared token system.
- Modify: `src/app/chat/page.tsx`
  - Theme-adapt chat shell, sidebar, composer, cards, and mobile navigation.
- Modify: `src/app/image-gen/page.tsx`
  - Theme-adapt image tool shell, controls, and result surfaces.
- Modify: `src/app/video-gen/page.tsx`
  - Theme-adapt video tool shell, controls, and result surfaces.
- Modify: `src/app/workflow/page.tsx`
  - Theme-adapt workflow shell, upload surfaces, selectors, progress views, and result cards.
- Modify: `src/app/admin/(console)/*.tsx`
  - Convert route-level business pages that still render custom light-only containers.
- Modify: `src/app/user-center/page.tsx`, `src/app/membership/page.tsx`, and other high-frequency user pages as time/risk allows in the same rollout.
- Verify: `pnpm validate`, `pnpm build`, targeted hard-coded-color scans.

### Task 1: Strengthen the shared theme system contract

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/table.tsx`

- [ ] **Step 1: Add missing semantic status/layer tokens to `globals.css`**

```css
:root {
  --success: #15803d;
  --success-foreground: #f0fdf4;
  --success-surface: color-mix(in srgb, var(--success) 12%, transparent);
  --warning: #d97706;
  --warning-foreground: #fffbeb;
  --warning-surface: color-mix(in srgb, var(--warning) 12%, transparent);
  --info: #2563eb;
  --info-foreground: #eff6ff;
  --info-surface: color-mix(in srgb, var(--info) 12%, transparent);
}

.dark {
  --success: #4ade80;
  --success-foreground: #052e16;
  --warning: #fbbf24;
  --warning-foreground: #451a03;
  --info: #60a5fa;
  --info-foreground: #082f49;
}
```

- [ ] **Step 2: Ensure shared UI primitives consume semantic token colors only**

```tsx
// Example target shape for component classes
'border-border bg-card text-card-foreground'
'hover:bg-accent hover:text-accent-foreground'
'data-[state=active]:bg-background'
```

- [ ] **Step 3: Run type/lint safety after the shared contract update**

Run: `pnpm validate`
Expected: PASS with no new style-token regressions in shared UI files

### Task 2: Theme-adapt user AI tool surfaces

**Files:**
- Modify: `src/app/chat/page.tsx`
- Modify: `src/app/image-gen/page.tsx`
- Modify: `src/app/video-gen/page.tsx`
- Modify: `src/app/workflow/page.tsx`

- [ ] **Step 1: Replace top-level AI tool page shells and sticky headers with semantic surfaces**

```tsx
<div className="min-h-screen bg-background text-foreground">
  <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
```

- [ ] **Step 2: Convert form controls, option chips, upload panels, and result cards from fixed light colors to token-driven classes**

```tsx
className="rounded-xl border border-border bg-card text-foreground"
className="text-muted-foreground hover:text-foreground"
className="bg-secondary text-secondary-foreground"
className="focus:border-ring"
```

- [ ] **Step 3: Normalize action buttons and feedback states onto primary/secondary/destructive semantics**

```tsx
className="bg-primary text-primary-foreground hover:bg-primary/85"
className="border-border bg-background text-foreground hover:bg-secondary"
className="border-red-500/20 bg-red-500/12 text-red-700 dark:text-red-300"
```

- [ ] **Step 4: Run focused hard-coded-color scans on the AI tool pages**

Run:
```bash
rg -n "bg-white|text-\\[#|border-black|bg-\\[#f5f5f7\\]|text-\\[#555555\\]|text-\\[#6e6e73\\]" \
  src/app/chat/page.tsx src/app/image-gen/page.tsx src/app/video-gen/page.tsx src/app/workflow/page.tsx
```
Expected: No remaining matches for primary surface/baseline UI colors, or only deliberate content-specific exceptions

- [ ] **Step 5: Re-run type/lint safety**

Run: `pnpm validate`
Expected: PASS after AI tool theme adaptation

### Task 3: Theme-adapt shared admin business surfaces

**Files:**
- Modify: `src/features/admin/admin-ai-jobs-module.tsx`
- Modify: `src/features/admin/admin-ai-models-module.tsx`
- Modify: `src/features/admin/admin-help-center-page.tsx`
- Modify: `src/features/admin/admin-membership-config-module.tsx`
- Modify: `src/features/admin/admin-permissions-module.tsx`
- Modify: `src/features/admin/admin-work-order-queue.tsx`
- Modify: `src/features/admin/admin-module-guide.tsx`
- Modify: `src/features/admin/admin-ai-config-test-dialog.tsx`
- Modify: `src/features/admin/admin-content-actions.tsx`

- [ ] **Step 1: Convert custom admin cards, section wrappers, and filter bars to shared token surfaces**

```tsx
className="rounded-lg border border-border bg-card p-4 shadow-sm"
className="border-b border-border"
className="bg-secondary/70 text-muted-foreground"
```

- [ ] **Step 2: Convert admin detail pills, inline badges, and state chips away from fixed neutrals**

```tsx
className="rounded-md border border-border bg-secondary/70 text-muted-foreground"
className="border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
```

- [ ] **Step 3: Convert admin dialogs, test output panes, and text blocks to dark-compatible surfaces**

```tsx
className="rounded-md border border-border bg-card text-foreground"
className="bg-popover text-popover-foreground"
className="text-muted-foreground"
```

- [ ] **Step 4: Run focused hard-coded-color scans on the updated admin feature modules**

Run:
```bash
rg -n "bg-white|border-neutral-200|text-neutral-950|text-neutral-700|text-neutral-600|bg-neutral-100|bg-neutral-50" \
  src/features/admin
```
Expected: Remaining matches limited to modules not yet scheduled in this rollout, with no matches in the files edited above

- [ ] **Step 5: Re-run type/lint safety**

Run: `pnpm validate`
Expected: PASS after shared admin module theme adaptation

### Task 4: Theme-adapt route-level admin and high-frequency user pages

**Files:**
- Modify: `src/app/admin/(console)/page.tsx`
- Modify: `src/app/admin/(console)/agent-capabilities/page.tsx`
- Modify: `src/app/admin/(console)/benefits/page.tsx`
- Modify: `src/app/admin/(console)/content/page.tsx`
- Modify: `src/app/admin/(console)/help-center/page.tsx`
- Modify: `src/app/admin/(console)/memberships/page.tsx`
- Modify: `src/app/admin/(console)/orders/page.tsx`
- Modify: `src/app/admin/(console)/partners/page.tsx`
- Modify: `src/app/admin/(console)/permissions/page.tsx`
- Modify: `src/app/admin/(console)/settings/page.tsx`
- Modify: `src/app/user-center/page.tsx`
- Modify: `src/app/membership/page.tsx`

- [ ] **Step 1: Replace route-level card/table/hero wrappers with semantic containers**

```tsx
className="rounded-xl border border-border bg-card shadow-sm"
className="text-foreground"
className="text-muted-foreground"
```

- [ ] **Step 2: Convert page-local tabs, counters, and stat cards to shared token semantics**

```tsx
active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
className="rounded-full bg-secondary text-muted-foreground"
```

- [ ] **Step 3: Run focused hard-coded-color scans on the route-level pages included in this batch**

Run:
```bash
rg -n "bg-white|text-\\[#|border-black|border-neutral-200|text-neutral-950|text-neutral-700|text-neutral-600" \
  src/app/admin src/app/user-center/page.tsx src/app/membership/page.tsx
```
Expected: Remaining matches should be confined to pages intentionally deferred to later batches

- [ ] **Step 4: Re-run type/lint safety**

Run: `pnpm validate`
Expected: PASS after route-level theme adaptation

### Task 5: Final verification and residual governance scan

**Files:**
- Verify only

- [ ] **Step 1: Run repository validation**

Run: `pnpm validate`
Expected: PASS for `ts-check` and `lint:build`

- [ ] **Step 2: Run production build**

Run: `pnpm build`
Expected: PASS with a successful Next.js production build

- [ ] **Step 3: Run a residual scan for forbidden baseline hard-coded colors in the active UI surface**

Run:
```bash
rg -n "bg-white|text-\\[#1d1d1f\\]|text-\\[#555555\\]|text-\\[#6e6e73\\]|border-black|border-neutral-200" src/app src/features
```
Expected: Only deliberate exceptions remain, and each should be reviewable as non-baseline content usage

- [ ] **Step 4: Verify local runtime manually or via browser automation on representative pages**

Check:
- `/home`
- `/chat`
- `/image-gen`
- `/video-gen`
- `/workflow`
- `/my-assets`
- `/admin`
- `/admin/ai-models`
- `/admin/help-center`
- `/admin/permissions`

Expected:
- All pages respond to `浅色 / 夜间 / 跟随系统`
- No large light-only or dark-only surface islands remain
- Admin dense surfaces remain legible in dark mode
- AI tool forms, upload panels, result cards, and dialogs remain readable in both themes
