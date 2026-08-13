// Shared by lib/auth/session-cookies.ts and
// lib/auth/super-admin-session-cookies.ts. Defaults to Secure in production
// (so session cookies never travel over plain HTTP) — COOKIE_SECURE is an
// explicit escape hatch for testing a production build over plain HTTP
// (e.g. hitting a bare IP:port with no TLS yet), not something to leave set
// in a real deployment: Secure is what stops these httpOnly JWT cookies
// from being sent in cleartext.
export function isSecureCookieEnabled(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}
