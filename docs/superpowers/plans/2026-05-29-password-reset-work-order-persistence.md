## Implementation Plan

1. Fix public login to validate passwords instead of creating sessions by phone only.
2. Add separate first-time password setup and forced reset password flows.
3. Add password reset work order request and admin handling APIs.
4. Reuse the admin users work-order queue to display and process reset work orders.
5. Replace in-memory reset work orders with a persisted database table and migration.
6. Verify TypeScript, eslint, and migration execution.
