export const ADMIN_SESSION_COOKIE = 'styx_admin_session';

export function getAdminAuthSecret() {
  return process.env.STYX_ADMIN_AUTH_SECRET ?? null;
}
