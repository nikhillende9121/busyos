import type { NextResponse } from "next/server";
import type { TokenPair } from "@/modules/auth/types/auth.types";
import { isSecureCookieEnabled } from "./secure-cookie";

// Server-only: reads/writes the httpOnly cookies that carry the JWT pair
// issued by modules/auth/service/auth.service.ts. The backend API itself
// only ever sees "Authorization: Bearer <token>" (shared/middleware/with-api-auth.ts
// is unchanged) — these cookies exist purely so the browser doesn't have to
// hold the raw token in JS-readable storage. See
// app/api/proxy/v1/[...path]/route.ts for where they're translated back
// into a Bearer header, and app/api/session/**/route.ts for where they're
// set/cleared.
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

// Mirrors the backend's own default token lifetimes (shared/auth/jwt.ts —
// JWT_EXPIRES_IN default "15m", JWT_REFRESH_EXPIRES_IN default "7d"). If
// those env vars are overridden in production, update these to match — a
// mismatch only affects how promptly a stale cookie gets dropped
// client-side, never the actual JWT expiry itself, which the backend
// enforces regardless.
const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const baseCookieOptions = {
  httpOnly: true,
  secure: isSecureCookieEnabled(),
  sameSite: "lax" as const,
  path: "/",
};

export function setSessionCookies(response: NextResponse, tokens: TokenPair): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseCookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", { ...baseCookieOptions, maxAge: 0 });
}
