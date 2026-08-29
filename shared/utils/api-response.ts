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

// A list export's response is the raw file, not the {success,data,message}
// envelope — Content-Disposition is what makes the browser download it
// (see components/resource/export-button.tsx) rather than navigate to it.
// An error path still goes through handleRouteError/successResponse's usual
// JSON envelope, since only the success case is actually a file.
export function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
