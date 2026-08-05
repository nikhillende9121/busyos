import type { ProductImage } from "@prisma/client";
import { cloudinaryImageUrl, CLOUDINARY_TRANSFORM } from "@/shared/utils/cloudinary";
import type { ProductImageView } from "../types/product-image.types";

// Split out from product-image.service.ts so that product.service.ts (which
// needs only this pure mapping to build ProductView.images) doesn't
// transitively import the repository/prisma modules that service also
// touches — those require a live DATABASE_URL at import time (see
// shared/database/prisma.ts) and would otherwise break product.service.ts's
// unit tests, which mock the repository layer but not prisma itself.
export function toProductImageView(image: ProductImage): ProductImageView {
  return {
    id: image.id.toString(),
    url: cloudinaryImageUrl(image.publicId, CLOUDINARY_TRANSFORM.full),
    thumbnailUrl: cloudinaryImageUrl(image.publicId, CLOUDINARY_TRANSFORM.thumbnail),
    sortOrder: image.sortOrder,
  };
}
