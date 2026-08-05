import { NextResponse } from "next/server";
import { clearSuperAdminSessionCookies } from "@/lib/auth/super-admin-session-cookies";

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSuperAdminSessionCookies(response);
  return response;
}
