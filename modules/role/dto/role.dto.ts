// Role has no createdBy/updatedBy columns (unlike Warehouse) — nothing to
// carry through here beyond the fields actually stored.
export type CreateRoleDto = {
  tenantId: bigint;
  name: string;
  code: string;
  permissionCodes?: string[];
};

export type UpdateRoleDto = {
  tenantId: bigint;
  roleId: bigint;
  name?: string;
  code?: string;
  permissionCodes?: string[];
};
