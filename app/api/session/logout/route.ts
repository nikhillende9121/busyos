import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/auth/session-cookies";

// No backend call: tokens are stateless JWTs with no server-side
// revocation list (see modules/auth/service/auth.service.ts), so "logout"
// is just dropping the cookies that carry them.
export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}
