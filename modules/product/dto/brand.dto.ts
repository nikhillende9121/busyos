export type CreateBrandDto = {
  tenantId: bigint;
  name: string;
};

export type UpdateBrandDto = {
  tenantId: bigint;
  brandId: bigint;
  name?: string;
};

export type UploadBrandImageDto = {
  tenantId: bigint;
  brandId: bigint;
  file: File;
};

export type RemoveBrandImageDto = {
  tenantId: bigint;
  brandId: bigint;
};
