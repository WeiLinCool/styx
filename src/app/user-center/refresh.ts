export function isUserCenterPath(pathname: string | null | undefined) {
  return pathname === '/user-center';
}

export function shouldRefreshUserCenterOnEntry(input: {
  pathname: string | null | undefined;
  isLoggedIn: boolean;
  hasUser: boolean;
}) {
  return input.isLoggedIn && input.hasUser && isUserCenterPath(input.pathname);
}

export function shouldRefreshUserCenterOnResume(input: {
  pathname: string | null | undefined;
  isLoggedIn: boolean;
  hasUser: boolean;
  visibilityState: DocumentVisibilityState;
  hasFocus: boolean;
}) {
  return (
    shouldRefreshUserCenterOnEntry(input) &&
    input.visibilityState === 'visible' &&
    input.hasFocus
  );
}
