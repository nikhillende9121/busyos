export type CreateTenantDto = {
  name: string;
  code: string;
  planId: bigint;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

export type UpdateTenantStatusDto = {
  tenantId: bigint;
  status: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED";
};

export type UploadTenantLogoDto = {
  tenantId: bigint;
  file: File;
};

export type RemoveTenantLogoDto = {
  tenantId: bigint;
};

export type ChangeTenantPlanDto = {
  tenantId: bigint;
  planId: bigint;
};
