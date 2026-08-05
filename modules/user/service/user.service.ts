import { Prisma } from "@prisma/client";
import type { User, Role, Warehouse } from "@prisma/client";
import { userRepository } from "../repository/user.repository";
import { hashPassword } from "@/modules/auth/utils/password.util";
import { AppError } from "@/shared/errors/app-error";
import type { CreateUserDto, UpdateUserDto } from "../dto/user.dto";
import type { UserView } from "../types/user.types";

type UserWithRole = User & { role: Role; warehouse: Warehouse | null };

export const userService = {
  async list(tenantId: bigint): Promise<UserView[]> {
    const users = await userRepository.findManyByTenant(tenantId);
    return users.map(toUserView);
  },

  async getById(tenantId: bigint, userId: bigint): Promise<UserView> {
    const user = await userRepository.findByIdForTenant(tenantId, userId);
    if (!user) {
      throw new AppError("RESOURCE_NOT_FOUND", "User not found");
    }
    return toUserView(user);
  },

  async create(dto: CreateUserDto): Promise<UserView> {
    const role = await userRepository.findRoleForTenant(dto.tenantId, dto.roleId);
    if (!role) {
      throw new AppError("VALIDATION_ERROR", "roleId does not belong to this tenant");
    }
    if (dto.warehouseId) {
      const warehouse = await userRepository.findWarehouseForTenant(dto.tenantId, dto.warehouseId);
      if (!warehouse) {
        throw new AppError("VALIDATION_ERROR", "warehouseId does not belong to this tenant");
      }
    }

    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await userRepository.create({
        tenantId: dto.tenantId,
        roleId: dto.roleId,
        warehouseId: dto.warehouseId ?? undefined,
        name: dto.name,
        email: dto.email,
        password: passwordHash,
        status: "ACTIVE",
        createdBy: dto.createdBy,
      });
      return toUserView(user);
    } catch (error) {
      throw toDuplicateEmailError(error);
    }
  },

  async update(dto: UpdateUserDto): Promise<UserView> {
    const existing = await userRepository.findByIdForTenant(dto.tenantId, dto.userId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "User not found");
    }
    if (dto.roleId !== undefined) {
      const role = await userRepository.findRoleForTenant(dto.tenantId, dto.roleId);
      if (!role) {
        throw new AppError("VALIDATION_ERROR", "roleId does not belong to this tenant");
      }
    }
    if (dto.warehouseId) {
      const warehouse = await userRepository.findWarehouseForTenant(dto.tenantId, dto.warehouseId);
      if (!warehouse) {
        throw new AppError("VALIDATION_ERROR", "warehouseId does not belong to this tenant");
      }
    }

    const user = await userRepository.update(dto.userId, {
      name: dto.name,
      roleId: dto.roleId,
      status: dto.status,
      // undefined = leave unchanged (Prisma skips it in the UPDATE);
      // null = explicitly clear the restriction — see dto/user.dto.ts.
      warehouseId: dto.warehouseId,
      updatedBy: dto.updatedBy,
    });
    return toUserView(user);
  },

  async remove(tenantId: bigint, userId: bigint, deletedBy?: bigint): Promise<void> {
    const existing = await userRepository.findByIdForTenant(tenantId, userId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "User not found");
    }
    // No "last active admin" guard — a real but rare edge case, deliberately
    // not handled in v1 rather than adding speculative protection.
    await userRepository.softDelete(userId, deletedBy);
  },
};

function toDuplicateEmailError(error: unknown): AppError {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new AppError("DUPLICATE_EMAIL", "A user with this email already exists");
  }
  return error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Unexpected error");
}

function toUserView(user: UserWithRole): UserView {
  return {
    id: user.id.toString(),
    name: user.name,
    email: user.email,
    roleId: user.roleId.toString(),
    roleName: user.role.name,
    warehouseId: user.warehouseId?.toString() ?? null,
    warehouseName: user.warehouse?.name ?? null,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
