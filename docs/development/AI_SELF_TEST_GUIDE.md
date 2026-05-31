# AI Self-Test Guide

This repository uses a fixed local port for agent-driven browser verification.

## Port Rule

- Reserve `127.0.0.1:4000` for Playwright-style self-test runs.
- Do not point AI/browser self-tests at opportunistic ports like `3001`, `3210`, or whatever `next dev` auto-selected.
- If `4000` is occupied, stop the conflicting process first. Do not silently switch ports.

## Why

The main failure mode in agent self-testing has been: one command starts a dev server on a fallback port, then later commands or browser tools cannot reliably reconnect to that same instance. A fixed port removes that ambiguity.

## Required Flow

1. Build first.
2. Start the app on `127.0.0.1:4000`.
3. Verify the port responds before running browser checks.
4. Run Playwright against the fixed config.
5. Shut the server down or leave clear notes if it stays running.

## Commands

Build:

```bash
pnpm build
```

Start the dedicated self-test server:

```bash
pnpm dev:pw
```

This command intentionally enables development auth bypass for the seeded active user:

- `STYX_ENABLE_DEV_AUTH=true`
- `STYX_DEV_USER_ID=${STYX_DEV_USER_ID:-00000000-0000-4000-8000-000000000001}`

Health check:

```bash
curl -I http://127.0.0.1:4000
```

Run all local Playwright E2E tests:

```bash
pnpm pw:test
```

Run the fully automated local loop:

```bash
pnpm pw:test:auto
```

Run the chat loop only:

```bash
pnpm pw:test:chat
```

Run one spec:

```bash
pnpm exec playwright test tests/e2e/admin-ai-config.spec.ts -c playwright.local.config.ts
```

## Human vs AI Responsibility

- Human: business acceptance, product judgment, whether the experience is right
- AI/script: fixed-port startup, health checks, browser test execution, artifact capture, teardown

The default expectation is that feature-level regression and route-level browser checks should be automated through `pw:test:auto` or a narrower wrapper like `pw:test:chat`, instead of requiring a human to manually start ports and sequence commands.

## Rules For AI Agents

- Never assume a prior `pnpm dev` shell is still reachable.
- Never rely on Next.js auto-port fallback for verification.
- Always report the exact port used in the verification note.
- If localhost access fails, record the blocker explicitly instead of claiming browser verification happened.

## Existing Configs

- `playwright.local.config.ts`: standard fixed-port config for local self-test on `127.0.0.1:4000`
- `playwright.admin-ai.config.ts`: legacy targeted config for admin AI work; keep only when a task explicitly depends on it
