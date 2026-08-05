import type { NextResponse } from "next/server";
import type { SuperAdminTokenPair } from "@/modules/super-admin/types/auth.types";

// Mirrors lib/auth/session-cookies.ts exactly, but under distinct cookie
// names — a Super Admin session and a tenant-user session are
// deliberately independent (see shared/middleware/with-super-admin-auth.ts),
// so a browser can even hold both at once without collision.
export const SUPER_ADMIN_ACCESS_TOKEN_COOKIE = "super_admin_access_token";
export const SUPER_ADMIN_REFRESH_TOKEN_COOKIE = "super_admin_refresh_token";

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setSuperAdminSessionCookies(response: NextResponse, tokens: SuperAdminTokenPair): void {
  response.cookies.set(SUPER_ADMIN_ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseCookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
  response.cookies.set(SUPER_ADMIN_REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

export function clearSuperAdminSessionCookies(response: NextResponse): void {
  response.cookies.set(SUPER_ADMIN_ACCESS_TOKEN_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
  response.cookies.set(SUPER_ADMIN_REFRESH_TOKEN_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
}
