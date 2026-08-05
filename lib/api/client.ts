"use client";

// Every dashboard data call goes through /api/proxy/v1/** (never
// /api/v1/** directly) — that route translates the browser's httpOnly
// session cookie into the "Authorization: Bearer <token>" header the real
// API expects, and transparently retries once on a 401 after refreshing
// (see app/api/proxy/v1/[...path]/route.ts). Unwraps the
// {success, data, message} / {success:false, error} envelope every
// app/api/v1/** route already returns (shared/utils/api-response.ts,
// shared/errors/handle-route-error.ts).
export class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

type ApiEnvelope<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: { code: string; message: string; details?: unknown } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData bodies (file uploads) must NOT get a Content-Type header set
  // here — the browser sets its own multipart boundary when it serializes
  // the FormData, and overriding it with "application/json" would corrupt
  // the request.
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`/api/proxy/v1${path}`, {
    ...init,
    headers: isFormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });

  let json: ApiEnvelope<T>;
  try {
    json = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError("INTERNAL_ERROR", `Request to ${path} failed with status ${response.status}`);
  }

  if (!json.success) {
    // No session left to salvage — the proxy already tried a silent
    // refresh and it also failed. Bounce to /login rather than showing a
    // dead-end error toast with no way back in. Guarded to never fire while
    // already on /login: AuthProvider's `me` query runs on every page
    // (including /login, before any session exists), so an unconditional
    // redirect here would hard-reload /login -> refetch `me` -> 401 ->
    // reload again, forever. Also never fires under /super-admin/** — that
    // area has its own, entirely separate session (see
    // lib/api/super-admin-client.ts) and should never bounce to this
    // client's /login.
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const skipRedirect = pathname === "/login" || pathname.startsWith("/super-admin");
    if (json.error.code === "UNAUTHENTICATED" && typeof window !== "undefined" && !skipRedirect) {
      window.location.href = "/login";
    }
    throw new ApiError(json.error.code, json.error.message, json.error.details);
  }
  return json.data;
}

function toQueryString(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return "";
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    search.set(key, String(value));
  }
  return `?${search.toString()}`;
}

export const apiClient = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>(`${path}${toQueryString(params)}`, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  // For file uploads — pass a FormData body, e.g. one built with a "files"
  // field per selected File (see app/(dashboard)/products/page.tsx).
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};
