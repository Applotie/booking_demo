import { NextResponse } from 'next/server';
import { adminSessionState, requireAdmin, safeNextPath } from './lib/server/admin-auth.js';

const LOGIN_PATH = '/admin/login';

// Admin pages need a signed-in admin session; the admin API answers 401 instead.
export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/api/admin')) {
    return (await requireAdmin(request)) || NextResponse.next();
  }

  const state = await adminSessionState(request);
  const signedIn = state === 'ok' || state === 'disabled';

  if (pathname === LOGIN_PATH) {
    if (signedIn) return NextResponse.redirect(new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.url));
    return NextResponse.next();
  }

  if (signedIn) return NextResponse.next();
  const login = new URL(LOGIN_PATH, request.url);
  login.searchParams.set('next', safeNextPath(pathname + search));
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/admin/:path*'],
};
