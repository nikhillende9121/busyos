import { v2 as cloudinary } from "cloudinary";

// Config read lazily inside each function (same pattern as
// shared/auth/jwt.ts reading process.env.JWT_SECRET) so importing this
// module doesn't fail in tests/routes that never actually call it.
let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  configured = true;
}

// Uploads via a base64 data URI rather than a stream — the Cloudinary SDK
// accepts one directly, and product images are small enough (see the
// caller's size cap in modules/product/service/product-image.service.ts)
// that buffering the whole file in memory is not a concern.
export async function uploadImage(buffer: Buffer, mimeType: string, folder: string): Promise<string> {
  ensureConfigured();
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const result = await cloudinary.uploader.upload(dataUri, { folder });
  return result.public_id;
}

export async function destroyImage(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId);
}

// Transformations are applied via the URL, not at upload time, so the
// same stored publicId can serve both a thumbnail and a full-size view.
export const CLOUDINARY_TRANSFORM = {
  thumbnail: "f_auto,q_auto,w_100,h_100,c_fill",
  full: "f_auto,q_auto,w_1200",
  // c_fit, not c_fill: a logo is usually non-square and shouldn't be
  // cropped to fit a fixed box the way a product photo thumbnail can be.
  logo: "f_auto,q_auto,w_160,h_160,c_fit",
} as const;

export function cloudinaryImageUrl(publicId: string, transform: string): string {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transform}/${publicId}`;
}
