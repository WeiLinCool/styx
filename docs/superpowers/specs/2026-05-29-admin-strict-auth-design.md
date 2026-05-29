# Admin Strict Auth Design

## Summary

This change replaces the current mixed admin access behavior with a dedicated, strict management-console authentication flow. The admin console will use a standalone login route, a separate second-factor verification step, and a formal admin session that is distinct from the public user login state. Until SMS verification is integrated, only explicitly configured temporary whitelist accounts may complete the second step and enter the console.

## Scope

- Add a dedicated admin login entry at `/admin/login`.
- Add a second-step verification page at `/admin/login/verify`.
- Require a formal admin session for every `/admin` route.
- Remove development-only admin auto-access and inline access-denied login widgets from the admin shell.
- Add a temporary whitelist bypass for the second-factor step until SMS verification is implemented.
- Record audit metadata for admin login, whitelist bypass, logout, and denied access outcomes.

## Goals

- Make the management console feel and behave like a high-trust asset control surface.
- Ensure unauthenticated or partially authenticated visitors can never remain inside `/admin`.
- Keep the current implementation compatible with a future real SMS OTP service.
- Prevent the temporary bypass from becoming an invisible permanent backdoor.

## Non-Goals

- Integrating a real SMS provider in this change.
- Reworking the public site login/register flow.
- Introducing a broad RBAC redesign beyond current admin-role checks.

## Architecture

The admin authentication flow is split into three boundaries:

### 1. Credential entry boundary

`/admin/login` accepts an admin-specific credential form. The first step validates username and password, confirms the user is active, and confirms the account has an allowed admin role. This step does not grant admin access on its own. Instead, it creates a short-lived pending admin-auth challenge and redirects to the verification route.

### 2. Second-factor boundary

`/admin/login/verify` resolves the pending challenge and renders the verification UI. In the final design, this page will validate an SMS OTP. In the temporary design, the page still behaves as the second-factor checkpoint, but only explicitly whitelisted accounts are allowed to continue without real OTP verification. Non-whitelisted accounts remain blocked here with a clear “verification not yet available” state.

### 3. Admin session boundary

All `/admin` routes require a dedicated admin session cookie or token created only after the second-factor step succeeds or the whitelist bypass is approved. If the session is absent, expired, revoked, or insufficient, the request is redirected to `/admin/login`. Public user auth cookies are not enough to access the admin console.

## Route Behavior

- `GET /admin/login`
  Renders the dedicated management-console login page.
- `POST /admin/login`
  Validates the first-step credentials and creates a pending admin challenge.
- `GET /admin/login/verify`
  Renders the second-factor verification page for a valid pending challenge.
- `POST /admin/login/verify`
  Future home of SMS OTP verification.
- `POST /admin/login/whitelist-bypass`
  Temporary endpoint that completes the second step only for explicitly whitelisted accounts with valid pending challenges.
- `POST /admin/logout`
  Revokes the admin session and redirects back to `/admin/login`.
- `GET /admin/*`
  Requires a valid admin session. No embedded login form, no development bypass, no partially authenticated shell rendering.

## Session Model

The admin console should stop depending on the current “public auth cookie plus admin role lookup” pattern for route entry. The new model should introduce a distinct admin session concept with these traits:

- Created only after full admin auth completion.
- Stored in an admin-specific cookie, separate from public auth cookies.
- Bound to a specific user id, admin roles snapshot, auth mode, and expiry.
- Revocable independently from public user sessions.
- Tagged with `authMode` values such as `otp` or `whitelist_bypass`.

Recommended session metadata:

```ts
type AdminSession = {
  id: string;
  userId: string;
  authMode: 'otp' | 'whitelist_bypass';
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};
```

Recommended pending challenge metadata:

```ts
type PendingAdminChallenge = {
  id: string;
  userId: string;
  phone: string | null;
  expiresAt: string;
  completedAt: string | null;
};
```

## UI Design

The login experience should present the admin area as a serious operational surface rather than a generic member login.

### Login page visual direction

- Full-page dedicated layout, not a small modal or embedded card.
- High-contrast neutral palette with restrained accent use.
- Dense but readable typography with clear hierarchy.
- Left information rail for trust cues: console name, access policy, audit notice, and operator guidance.
- Right authentication panel for the active form.

### Login page content

The first step page should include:

- Management-console title and short security description.
- Username input.
- Password input.
- Primary action to continue to verification.
- Inline error state for invalid credentials or insufficient privileges.
- Support copy that makes clear this is not the public user login.

### Verification page content

The second-step page should include:

- Masked phone number associated with the pending challenge.
- OTP input shell and submit button.
- Countdown or resend disabled area, clearly marked as not yet active.
- Temporary whitelist call-to-action only when the account is configured for bypass.
- Warning copy stating that whitelist access is temporary and audited.
- Blocked-state copy for non-whitelisted users explaining that second-factor service is not yet available.

### Post-login behavior

- Successful completion redirects to `/admin`.
- Logout always returns to `/admin/login`.
- Opening `/admin/login` with an already-valid admin session redirects to `/admin`.

## Temporary Whitelist Rules

The whitelist bypass is a constrained transitional mechanism, not a general fallback:

- It applies only after first-step credentials succeed.
- It applies only to active users with allowed admin roles.
- It applies only when the account identifier is explicitly configured in the whitelist source.
- It must be visible in both the UI and the audit trail as a temporary bypass.
- It should be easy to disable globally once OTP is live.
- It must never auto-apply based on environment, local mode, or missing configuration.

Recommended configuration shape:

```ts
type AdminWhitelistConfig = {
  enabled: boolean;
  accountIds: string[];
};
```

If `enabled` is false, the bypass endpoint should reject all requests.

## Authorization Rules

- Only active accounts may start the admin login flow.
- Only users with approved admin roles may proceed beyond the first step.
- First-step success is not equivalent to admin access.
- Pending challenges must expire quickly and become single-use.
- Admin session checks must happen at the route boundary before any admin content is rendered.
- All admin mutations should continue to validate role authorization server-side even after route entry.

## Error Handling

- Invalid username or password returns a generic credential error.
- Valid user without admin role returns a generic “access denied” style error without exposing role internals.
- Expired or missing pending challenge redirects to `/admin/login`.
- Non-whitelisted account on the verify page remains blocked with an explanatory message.
- Disabled whitelist bypass returns a clear server-side error and keeps the user on the verify page.
- Expired or revoked admin session redirects to `/admin/login`.

## Audit Requirements

Every sensitive transition should create a structured audit event:

- `admin.login_attempted`
- `admin.login_failed`
- `admin.challenge_created`
- `admin.verify_blocked`
- `admin.whitelist_bypass_granted`
- `admin.session_created`
- `admin.logout`
- `admin.session_denied`

Each event should record the actor id when known, target route, timestamp, IP, user agent, and auth mode when applicable.

## Implementation Notes

- Remove the current admin-shell login widget and access-denied embedded login action.
- Replace the current admin guard behavior so `/admin` redirects instead of rendering a development fallback shell.
- Keep the verification UI and endpoint boundaries stable so SMS OTP integration only fills in the verification step later.
- Avoid reusing public auth naming in admin code paths where it blurs security boundaries.

## Testing

- Add unit tests for admin guard redirect behavior when the admin session is absent.
- Add tests for pending challenge lifecycle: creation, expiry, single-use completion.
- Add tests for whitelist bypass eligibility and rejection paths.
- Add tests that public user auth alone cannot open `/admin`.
- Add route or component tests for login and verify page state rendering.
- Run targeted auth tests, lint, and TypeScript validation.

## Resolved Decisions

- The admin console uses a dedicated login route at `/admin/login`.
- The admin console uses a dedicated verification route at `/admin/login/verify`.
- SMS OTP is the intended second factor, but it is not implemented in this change.
- A temporary whitelist bypass is allowed only as a visible, auditable, explicitly configured exception.
- No development environment auto-login or inline admin access fallback remains in the final design.
