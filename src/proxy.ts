// Cookie-presence gate. Lightweight: does not decrypt the session here
// (decryption happens in the protected layout). Edge-runtime safe.
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

const PUBLIC = new Set(['/login', '/setup']);

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // root index redirects itself based on session state — let it through.
  if (path === '/' || PUBLIC.has(path)) return NextResponse.next();

  const hasCookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Apply to everything EXCEPT api, static files, and Next internals.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
