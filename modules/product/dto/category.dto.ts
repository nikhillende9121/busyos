export type CreateCategoryDto = {
  tenantId: bigint;
  name: string;
  parentId?: bigint | null;
};

export type UpdateCategoryDto = {
  tenantId: bigint;
  categoryId: bigint;
  name?: string;
  parentId?: bigint | null;
};

export type UploadCategoryImageDto = {
  tenantId: bigint;
  categoryId: bigint;
  file: File;
};

export type RemoveCategoryImageDto = {
  tenantId: bigint;
  categoryId: bigint;
};
