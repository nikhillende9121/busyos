import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authService } from "@/modules/auth/service/auth.service";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  setSessionCookies,
  clearSessionCookies,
} from "@/lib/auth/session-cookies";
import { getInternalOrigin } from "@/lib/api/internal-origin";

// A thin cookie -> bearer translation layer, nothing else: the real
// authorization pipeline (Auth -> Tenant -> Subscription -> Feature ->
// Permission) still runs, unchanged, inside app/api/v1/** itself (see
// shared/middleware/with-api-auth.ts). Routing every dashboard data call
// through here — instead of having Server/Client Components call
// modules/*/service functions directly — means the browser gets exactly
// the same authorization guarantees as any other API client, with zero
// duplicated auth logic.
//
// On a 401 from the underlying API (expired access token), this refreshes
// once via the httpOnly refresh_token cookie and retries — the browser
// never has to know a refresh happened.

type RouteParams = { path: string[] };

// ArrayBuffer, not text(): a UTF-8 string round-trip would corrupt binary
// bodies (e.g. multipart/form-data image uploads). ArrayBuffer is a valid
// BodyInit for both JSON and multipart, so this is a strict superset with
// no change in behavior for existing JSON traffic.
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
  const target = new URL(`/api/v1/${path.join("/")}${request.nextUrl.search}`, getInternalOrigin());
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
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  const initial = await forward(request, path, accessToken, body);
  if (initial.status !== 401) {
    return toNextResponse(initial);
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    return toNextResponse(initial);
  }

  try {
    const tokens = await authService.refresh({ refreshToken });
    const retried = await forward(request, path, tokens.accessToken, body);
    return toNextResponse(retried, (response) => setSessionCookies(response, tokens));
  } catch {
    return toNextResponse(initial, clearSessionCookies);
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
export async function PATCH(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  return handle(request, ctx.params);
}
export async function DELETE(request: NextRequest, ctx: { params: Promise<RouteParams> }) {
  return handle(request, ctx.params);
}
