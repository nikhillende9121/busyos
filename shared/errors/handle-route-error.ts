import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./app-error";

// The single place a caught error becomes an HTTP response. Controllers
// call this from a catch block instead of building error JSON by hand —
// see Docs/API_STANDARDS.md -> Response Envelope / Error Codes.
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      },
      { status: error.statusCode },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  // Never leak internal error details (stack traces, driver messages) to
  // the client — log server-side, return a generic message.
  console.error(error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    },
    { status: 500 },
  );
}
