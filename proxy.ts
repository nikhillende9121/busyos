import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authService } from "@/modules/auth/service/auth.service";
import { superAdminAuthService } from "@/modules/super-admin/service/auth.service";
import { verifyToken, verifySuperAdminToken } from "@/shared/auth/jwt";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setSessionCookies,
  clearSessionCookies,
} from "@/lib/auth/session-cookies";
import {
  SUPER_ADMIN_ACCESS_TOKEN_COOKIE,
  SUPER_ADMIN_REFRESH_TOKEN_COOKIE,
  setSuperAdminSessionCookies,
  clearSuperAdminSessionCookies,
} from "@/lib/auth/super-admin-session-cookies";

// Page-level UX guard only — NOT the authorization boundary. Real
// enforcement stays entirely inside shared/middleware/with-api-auth.ts /
// with-super-admin-auth.ts, which every app/api/v1/** route already runs
// (see with-api-auth.ts's own comment on why: Next 16 explicitly documents
// that Proxy shouldn't be relied on alone for auth). This file's only job
// is redirecting a signed-out visitor to the right login page before a
// protected page even renders, and transparently refreshing an expired
// access token so a still-valid session isn't kicked out just because its
// 15-minute access token happened to lapse between page loads.
//
// Two entirely independent sessions live here — a tenant-user session and
// a Super Admin session (see shared/middleware/with-super-admin-auth.ts) —
// dispatched purely on whether the path is under /super-admin, never mixed.
export async function proxy(request: NextRequest) {
  // The public marketing landing page — never guarded. The dashboard home
  // a signed-in user actually lands on lives at /dashboard, not here.
  if (request.nextUrl.pathname === "/") {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/super-admin")) {
    return guardSuperAdminSession(request);
  }
  return guardTenantSession(request);
}

async function guardTenantSession(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken) {
    try {
      verifyToken(accessToken);
      return NextResponse.next();
    } catch {
      // Expired/invalid — fall through and try a refresh below.
    }
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (refreshToken) {
    try {
      const tokens = await authService.refresh({ refreshToken });
      const response = NextResponse.next();
      setSessionCookies(response, tokens);
      return response;
    } catch {
      // Refresh token invalid/expired too — fall through to the login redirect.
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  const response = NextResponse.redirect(loginUrl);
  clearSessionCookies(response);
  return response;
}

async function guardSuperAdminSession(request: NextRequest) {
  const accessToken = request.cookies.get(SUPER_ADMIN_ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken) {
    try {
      verifySuperAdminToken(accessToken);
      return NextResponse.next();
    } catch {
      // Expired/invalid — fall through and try a refresh below.
    }
  }

  const refreshToken = request.cookies.get(SUPER_ADMIN_REFRESH_TOKEN_COOKIE)?.value;
  if (refreshToken) {
    try {
      const tokens = await superAdminAuthService.refresh({ refreshToken });
      const response = NextResponse.next();
      setSuperAdminSessionCookies(response, tokens);
      return response;
    } catch {
      // Refresh token invalid/expired too — fall through to the login redirect.
    }
  }

  const loginUrl = new URL("/super-admin/login", request.url);
  const response = NextResponse.redirect(loginUrl);
  clearSuperAdminSessionCookies(response);
  return response;
}

export const config = {
  // Everything except both login pages, the API (which polices its own
  // auth), Next.js/static assets, and the generated favicon (app/icon.tsx)
  // — unauthenticated requests for it (e.g. the browser tab icon while on
  // /login itself) must get the PNG, not a redirect to /login. "/" still
  // matches this pattern (middleware runs), but proxy() itself bypasses
  // it immediately — see the early return above — rather than trying to
  // special-case the root path in this regex.
  matcher: ["/((?!login|super-admin/login|api|_next/static|_next/image|favicon.ico|icon).*)"],
};
