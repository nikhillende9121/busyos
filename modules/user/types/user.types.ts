// Response shape returned to clients — password never leaves the service
// layer (see MODULES.md -> types/).
export type UserView = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  // null = unrestricted (acts at any of the tenant's warehouses) — see
  // Docs/business-rules/roles-and-permissions.md -> Warehouse-Scoped Users.
  warehouseId: string | null;
  warehouseName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};
