export type UploadProductImagesDto = {
  tenantId: bigint;
  productId: bigint;
  files: File[];
};

export type RemoveProductImageDto = {
  tenantId: bigint;
  productId: bigint;
  imageId: bigint;
};

export type MakePrimaryProductImageDto = {
  tenantId: bigint;
  productId: bigint;
  imageId: bigint;
};
