import { NextResponse, type NextRequest } from 'next/server';

import {
  ADMIN_SESSION_COOKIE,
  getAdminAuthSecret,
} from '@/server/auth/admin-auth-config';
import { readAdminSessionTokenEdge } from '@/server/auth/admin-session-token-edge';

const ADMIN_PUBLIC_PATHS = new Set(['/admin/login']);

function isAdminPublicPath(pathname: string) {
  return ADMIN_PUBLIC_PATHS.has(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);

  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const secret = getAdminAuthSecret();

  if (isAdminPublicPath(pathname)) {
    requestHeaders.set('x-styx-admin-public-route', '1');
    if (!secret) {
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }

    const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const session = sessionToken ? await readAdminSessionTokenEdge(sessionToken, secret) : null;
    if (session) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!secret || !sessionToken || !(await readAdminSessionTokenEdge(sessionToken, secret))) {
    const loginUrl = new URL('/admin/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
