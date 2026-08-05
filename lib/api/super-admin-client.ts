"use client";

import { ApiError } from "@/lib/api/client";

// Mirrors lib/api/client.ts exactly, but targets /api/proxy/super-admin/**
// (-> app/api/v1/super-admin/**, guarded by
// shared/middleware/with-super-admin-auth.ts) and bounces to
// /super-admin/login on an unrecoverable 401, not /login — the two
// sessions are entirely independent (see proxy.ts).
type ApiEnvelope<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: { code: string; message: string; details?: unknown } };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // FormData bodies (file uploads) must NOT get a Content-Type header set
  // here — the browser sets its own multipart boundary when it serializes
  // the FormData (see lib/api/client.ts's identical guard).
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`/api/proxy/super-admin${path}`, {
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
    const onLoginPage = typeof window !== "undefined" && window.location.pathname === "/super-admin/login";
    if (json.error.code === "UNAUTHENTICATED" && typeof window !== "undefined" && !onLoginPage) {
      window.location.href = "/super-admin/login";
    }
    throw new ApiError(json.error.code, json.error.message, json.error.details);
  }
  return json.data;
}

export const superAdminApiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
};
