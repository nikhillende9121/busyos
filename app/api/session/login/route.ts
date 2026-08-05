import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { loginSchema } from "@/modules/auth/schema/auth.schema";
import { authService } from "@/modules/auth/service/auth.service";
import { handleRouteError } from "@/shared/errors/handle-route-error";
import { setSessionCookies } from "@/lib/auth/session-cookies";

// Calls authService.login directly (same process, same module the real
// POST /api/v1/auth/login route calls) rather than doing a self-referential
// HTTP round-trip — this route's only extra job over the API route is
// turning the returned token pair into httpOnly cookies for the browser.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);
    const tokens = await authService.login(input);

    const response = NextResponse.json({ success: true });
    setSessionCookies(response, tokens);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
