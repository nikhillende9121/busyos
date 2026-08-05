export type RoleView = {
  id: string;
  name: string;
  code: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

// The Permission table is a fixed, platform-wide catalog (no tenantId) —
// see Docs/business-rules/roles-and-permissions.md. Grouping by `module`
// is what the Roles page's permission checklist is built from.
export type PermissionCatalogEntry = {
  code: string;
  module: string;
  action: string;
};
