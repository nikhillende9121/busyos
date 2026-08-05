import { Prisma } from "@prisma/client";
import type { Role, RolePermission, Permission } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { roleRepository } from "../repository/role.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreateRoleDto, UpdateRoleDto } from "../dto/role.dto";
import type { PermissionCatalogEntry, RoleView } from "../types/role.types";

type RoleWithPermissions = Role & { rolePermissions: (RolePermission & { permission: Permission })[] };

// Resolves and validates permission codes against the live Permission
// catalog — throws if any submitted code doesn't exist, rather than
// silently dropping unknown codes (a typo'd code should fail loudly, not
// grant a smaller-than-intended permission set).
async function resolvePermissionIds(codes: string[]): Promise<bigint[]> {
  if (codes.length === 0) return [];
  const permissions = await roleRepository.findPermissionsByCodes(codes);
  if (permissions.length !== new Set(codes).size) {
    const found = new Set(permissions.map((p) => p.code));
    const missing = codes.filter((code) => !found.has(code));
    throw new AppError("VALIDATION_ERROR", `Unknown permission code(s): ${missing.join(", ")}`);
  }
  return permissions.map((p) => p.id);
}

export const roleService = {
  async list(tenantId: bigint): Promise<RoleView[]> {
    const roles = await roleRepository.findManyByTenant(tenantId);
    return roles.map(toRoleView);
  },

  async getById(tenantId: bigint, roleId: bigint): Promise<RoleView> {
    const role = await roleRepository.findByIdForTenant(tenantId, roleId);
    if (!role) {
      throw new AppError("RESOURCE_NOT_FOUND", "Role not found");
    }
    return toRoleView(role);
  },

  async create(dto: CreateRoleDto): Promise<RoleView> {
    const permissionIds = await resolvePermissionIds(dto.permissionCodes ?? []);

    try {
      const role = await prisma.$transaction(async (tx) => {
        const created = await roleRepository.create(tx, {
          tenantId: dto.tenantId,
          name: dto.name,
          code: dto.code,
        });
        await roleRepository.replacePermissions(tx, created.id, permissionIds);
        return created;
      });
      return roleService.getById(dto.tenantId, role.id);
    } catch (error) {
      throw toDuplicateCodeError(error);
    }
  },

  async update(dto: UpdateRoleDto): Promise<RoleView> {
    const existing = await roleRepository.findByIdForTenant(dto.tenantId, dto.roleId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Role not found");
    }

    const permissionIds =
      dto.permissionCodes !== undefined ? await resolvePermissionIds(dto.permissionCodes) : null;

    try {
      await prisma.$transaction(async (tx) => {
        await roleRepository.update(tx, dto.roleId, { name: dto.name, code: dto.code });
        if (permissionIds !== null) {
          await roleRepository.replacePermissions(tx, dto.roleId, permissionIds);
        }
      });
      return roleService.getById(dto.tenantId, dto.roleId);
    } catch (error) {
      throw toDuplicateCodeError(error);
    }
  },

  // Blocked, not cascaded — see DATABASE.md -> Foreign Key Rules. A role
  // still assigned to an active user must be reassigned first, not
  // silently orphan that user's access.
  async remove(tenantId: bigint, roleId: bigint): Promise<void> {
    const existing = await roleRepository.findByIdForTenant(tenantId, roleId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Role not found");
    }
    const hasActiveUsers = await roleRepository.hasActiveUsers(roleId);
    if (hasActiveUsers) {
      throw new AppError("CONFLICT", "Cannot delete a role that still has users assigned");
    }
    await roleRepository.softDelete(roleId);
  },

  async listPermissionCatalog(): Promise<PermissionCatalogEntry[]> {
    const permissions = await roleRepository.listPermissionCatalog();
    return permissions.map((p) => ({ code: p.code, module: p.module, action: p.action }));
  },
};

function toDuplicateCodeError(error: unknown): AppError {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new AppError("DUPLICATE_CODE", "A role with this code already exists");
  }
  return error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Unexpected error");
}

function toRoleView(role: RoleWithPermissions): RoleView {
  return {
    id: role.id.toString(),
    name: role.name,
    code: role.code,
    permissions: role.rolePermissions.map((rp) => rp.permission.code),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}
