import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { superAdminAuthService } from "@/modules/super-admin/service/auth.service";
import {
  SUPER_ADMIN_ACCESS_TOKEN_COOKIE,
  SUPER_ADMIN_REFRESH_TOKEN_COOKIE,
  setSuperAdminSessionCookies,
  clearSuperAdminSessionCookies,
} from "@/lib/auth/super-admin-session-cookies";

// Mirrors app/api/proxy/v1/[...path]/route.ts exactly, for the Super Admin
// stack: cookie -> bearer translation in front of the real
// /api/v1/super-admin/** routes (which stay guarded by
// shared/middleware/with-super-admin-auth.ts, unchanged regardless of how
// the browser got its token there).
type RouteParams = { path: string[] };

// ArrayBuffer, not text(): a UTF-8 string round-trip would corrupt binary
// bodies (e.g. multipart/form-data image uploads) — same fix as
// app/api/proxy/v1/[...path]/route.ts, needed here now that Super Admin
// uploads a tenant logo through this proxy.
async function readBody(request: NextRequest): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }
  return request.arrayBuffer();
}

function forward(
  request: NextRequest,
  path: string[],
  accessToken: string | undefined,
  body: ArrayBuffer | undefined,
): Promise<Response> {
  const target = new URL(`/api/v1/super-admin/${path.join("/")}${request.nextUrl.search}`, request.nextUrl.origin);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  return fetch(target, { method: request.method, headers, body, cache: "no-store" });
}

async function toNextResponse(
  upstream: Response,
  mutateCookies?: (response: NextResponse) => void,
): Promise<NextResponse> {
  const text = await upstream.text();
  const response = new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  mutateCookies?.(response);
  return response;
}

async function handle(request: NextRequest, paramsPromise: Promise<RouteParams>): Promise<NextResponse> {
  const { path } = await paramsPromise;
  const body = await readBody(request);
  const accessToken = request.cookies.get(SUPER_ADMIN_ACCESS_TOKEN_COOKIE)?.value;

  const initial = await forward(request, path, accessToken, body);
  if (initial.status !== 401) {
    return toNextResponse(initial);
  }

  const refreshToken = request.cookies.get(SUPER_ADMIN_REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return toNextResponse(initial);
  }

  try {
    const tokens = await superAdminAuthService.refresh({ refreshToken });
    const retried = await forward(request, path, tokens.accessToken, body);
    return toNextResponse(retried, (response) => setSuperAdminSessionCookies(response, tokens));
  } catch {
    return toNextResponse(initial, clearSuperAdminSessionCookies);
  }
}

export async function GET(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  return handle(request, ctx.params);
}
export async function POST(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  return handle(request, ctx.params);
}
export async function PUT(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  return handle(request, ctx.params);
}
export async function DELETE(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  return handle(request, ctx.params);
}
