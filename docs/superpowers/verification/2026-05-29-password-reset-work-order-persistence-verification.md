## Verification Summary

- `pnpm exec tsc -p tsconfig.json --noEmit`
  - Result: pass
- `pnpm exec eslint src/server/db/schema.ts src/server/auth/password-reset-work-orders.ts src/server/repositories/admin-password-reset-work-orders.ts src/app/api/admin/password-reset-work-orders/'[workOrderId]'/processing/route.ts src/app/api/admin/password-reset-work-orders/'[workOrderId]'/approve/route.ts src/app/api/admin/password-reset-work-orders/'[workOrderId]'/archive/route.ts src/app/api/auth/password-reset-work-orders/route.ts`
  - Result: pass
- `DATABASE_URL='postgresql://wlz@localhost:5432/styx_dev' pnpm run db:migrate`
  - Result: pass (`Database migrations completed.`)

## Notes

- There remains one unrelated existing warning in `src/lib/auth-context.tsx` for raw `<img>` usage under Next.js linting.
- Password reset work orders are now persisted in the database table introduced by `drizzle/0004_password_reset_work_orders.sql`.

## End-to-End Verification

- Admin login
  - Request: `POST /api/admin/login`
  - Credentials: `admin / Admin@123456`
  - Result: pass
- Password reset work order creation
  - Request: `POST /api/auth/password-reset-work-orders`
  - User: `18120810787`
  - Result: pass
- Admin processing and approval
  - Requests:
    - `POST /api/admin/password-reset-work-orders/17f869e1-0a8a-4752-9656-22aeab591b61/processing`
    - `POST /api/admin/password-reset-work-orders/17f869e1-0a8a-4752-9656-22aeab591b61/approve`
  - Result: pass
  - Generated temporary password: `NF-UYSGMM`
- Temporary password sign-in
  - Request: `POST /api/auth/login`
  - User: `18120810787`
  - Password: temporary password above
  - Result: pass
  - Login payload returned `mustResetPassword: true`
- Forced reset marker check
  - Request: `GET /api/auth/me`
  - Result: pass
  - Response returned `authenticated: true` and `mustResetPassword: true`
- Permanent password reset
  - Request: `POST /api/auth/set-password`
  - Mode: `reset`
  - New password used for verification: `User@654321`
  - Result: pass
- Temporary password invalidation
  - Request: `POST /api/auth/login`
  - Password: `NF-UYSGMM`
  - Result: pass
  - Response: `401 {"error":{"code":"session_required","message":"手机号或密码错误。"}}`
- Permanent password sign-in
  - Request: `POST /api/auth/login`
  - Password: `User@654321`
  - Result: pass
  - Login payload returned `mustResetPassword: false`
