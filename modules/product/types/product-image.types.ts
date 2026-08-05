// url/thumbnailUrl are full Cloudinary delivery URLs, built server-side
// (see shared/utils/cloudinary.ts) — the client never needs Cloudinary
// config of its own.
export type ProductImageView = {
  id: string;
  url: string;
  thumbnailUrl: string;
  sortOrder: number;
};
