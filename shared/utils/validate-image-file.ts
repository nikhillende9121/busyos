import { AppError } from "@/shared/errors/app-error";

// Shared by every image-upload consumer (product gallery images, tenant
// logo) — one place to keep the allowed types/size cap in sync rather
// than each service redefining its own copy.
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function assertValidImageFile(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new AppError("VALIDATION_ERROR", `Unsupported image type: ${file.type || "unknown"}`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AppError("VALIDATION_ERROR", `${file.name} exceeds the 5MB limit`);
  }
}
