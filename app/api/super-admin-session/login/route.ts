import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { superAdminLoginSchema } from "@/modules/super-admin/schema/auth.schema";
import { superAdminAuthService } from "@/modules/super-admin/service/auth.service";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { setSuperAdminSessionCookies } from "@/lib/auth/super-admin-session-cookies";

// Mirrors app/api/session/login/route.ts exactly, for the Super Admin
// stack — calls superAdminAuthService.login directly (same process, same
// module the real POST /api/v1/super-admin/auth/login route calls).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = superAdminLoginSchema.parse(body);
    const tokens = await superAdminAuthService.login(input);

    const response = NextResponse.json({ success: true });
    setSuperAdminSessionCookies(response, tokens);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
