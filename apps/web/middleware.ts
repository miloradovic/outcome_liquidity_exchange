import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_SESSION_COOKIE_KEY = 'olx.authenticated';
const LOGIN_PATH = '/login';

function isProtectedPath(pathname: string): boolean {
  return pathname === '/wallet' || pathname.startsWith('/wallet/') || pathname === '/orders' || pathname.startsWith('/orders/');
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.get(AUTH_SESSION_COOKIE_KEY)?.value === '1';
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set('redirect', `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/wallet/:path*', '/orders/:path*'],
};
