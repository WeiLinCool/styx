## Context

The current account activation model supports opaque activation tokens and admin-triggered reissue. The user-facing activation panel accepts a token directly, while the admin user actions can call reissue/activate/suspend APIs. The desired flow is different: the user must initiate activation from their browser, generate a browser-bound work order, provide that work order to customer support, and then support approves it from the admin console.

Browser fingerprinting can provide a device binding signal, but it is not a secure identity proof by itself. The design therefore treats the fingerprint as server-stored binding context and an audit/risk signal. Activation still requires authenticated/authorized server-side approval.

## Goals / Non-Goals

**Goals:**
- Let pending users generate an activation binding work order from the user-facing activation panel.
- Derive a browser/device digest on the client and send only normalized fingerprint material needed to compute/store a server-side digest.
- Show the user a work order code they can give to customer support.
- Let authorized admins review pending activation binding work orders and approve or reject them.
- On approval, mark the account active and persist/audit the device binding context.
- Localize the admin console's visible operator-facing copy into Chinese.

**Non-Goals:**
- No admin-generated activation secret handoff.
- No bulk activation-code pool.
- No claim that browser fingerprinting is tamper-proof identity verification.
- No SMS/email delivery integration.
- No runtime i18n framework.

## Decisions

1. **Introduce activation binding work orders as first-class persisted records.**
   - Rationale: support needs a durable code/status object to review, approve, reject, expire, and audit.
   - Alternative considered: reuse `activation_tokens`. Tokens model secret redemption; work orders model support review and device binding, so overloading tokens would blur lifecycle rules.

2. **Generate the work order from the user-side activation panel.**
   - Rationale: the browser fingerprint must represent the user's current browser/device. Admin-side generation cannot capture that context.
   - Alternative considered: ask support to paste a generated admin token to the user. This misses device binding and reverses the required responsibility.

3. **Store a digest, not raw fingerprint data.**
   - Rationale: browser fingerprint components can be sensitive. The client will collect stable, coarse browser/device fields and submit them to the server; the server stores a salted hash/digest plus limited review metadata such as user agent family where needed.
   - Alternative considered: store full fingerprint JSON for support visibility. That increases privacy risk and is unnecessary for activation approval.

4. **Admin approval is the activation boundary.**
   - Rationale: a fingerprint/work order can be spoofed, so support approval remains the authoritative state change. Approval updates account state and records audit metadata.
   - Alternative considered: auto-activate when a fingerprinted work order is created. That would make fingerprinting the sole control and is not acceptable.

5. **Localize by replacing static admin copy directly.**
   - Rationale: the project already uses static Chinese copy and has no language switching requirement.
   - Alternative considered: add i18n. It would add overhead without a current product need.

## Risks / Trade-offs

- **Fingerprint instability across browser changes** -> Use it as binding/risk context, not a hard permanent identity; allow support to reject and ask the user to regenerate.
- **Fingerprint spoofing** -> Require admin approval and audit every approval/rejection.
- **Privacy concerns** -> Store hashed digest and minimal metadata; avoid displaying or persisting full raw component values.
- **Schema change complexity** -> Add focused migration/schema tests and keep repository boundaries aligned with existing account/admin patterns.
- **Partial localization** -> Search admin files for remaining English operator copy and smoke-check representative pages.
