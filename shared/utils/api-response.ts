import { NextResponse } from "next/server";

// Success envelope — see Docs/API_STANDARDS.md -> Response Envelope.
// The error-side envelope lives in shared/errors/handle-route-error.ts.
export function successResponse<T>(
  data: T,
  message: string,
  status = 200,
): NextResponse {
  return NextResponse.json({ success: true, data, message }, { status });
}
