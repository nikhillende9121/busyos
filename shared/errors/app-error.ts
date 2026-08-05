// Typed business errors — see Docs/API_STANDARDS.md -> Error Codes.
// Services throw AppError; shared/errors/handle-route-error.ts is the one
// place that maps it to an HTTP response. Controllers never construct error
// responses by hand.
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FEATURE_NOT_ENABLED"
  | "PERMISSION_DENIED"
  | "RESOURCE_NOT_FOUND"
  | "DUPLICATE_SKU"
  | "DUPLICATE_BARCODE"
  | "DUPLICATE_CODE"
  | "DUPLICATE_EMAIL"
  | "CONFLICT"
  | "INSUFFICIENT_STOCK"
  | "SUBSCRIPTION_EXPIRED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FEATURE_NOT_ENABLED: 403,
  PERMISSION_DENIED: 403,
  SUBSCRIPTION_EXPIRED: 403,
  RESOURCE_NOT_FOUND: 404,
  DUPLICATE_SKU: 409,
  DUPLICATE_BARCODE: 409,
  DUPLICATE_CODE: 409,
  DUPLICATE_EMAIL: 409,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 422,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.details = details;
  }
}
