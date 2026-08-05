import { Prisma } from "@prisma/client";
import type { Warehouse } from "@prisma/client";
import { warehouseRepository } from "../repository/warehouse.repository";
import { AppError } from "@/shared/errors/app-error";
import { assertWarehouseAccess } from "@/shared/utils/assert-warehouse-access";
import type { CreateWarehouseDto, UpdateWarehouseDto } from "../dto/warehouse.dto";
import type { WarehouseView } from "../types/warehouse.types";

export const warehouseService = {
  // A warehouse-scoped caller (see Docs/business-rules/roles-and-permissions.md
  // -> Warehouse-Scoped Users) only ever sees their own store in this list
  // — not filtered client-side, since a scoped user has no legitimate
  // reason to even know other stores exist.
  async list(tenantId: bigint, scopedWarehouseId: bigint | null): Promise<WarehouseView[]> {
    const warehouses = await warehouseRepository.findManyByTenant(tenantId, scopedWarehouseId);
    return warehouses.map(toWarehouseView);
  },

  async getById(tenantId: bigint, warehouseId: bigint, scopedWarehouseId: bigint | null): Promise<WarehouseView> {
    assertWarehouseAccess({ warehouseId: scopedWarehouseId }, warehouseId);
    const warehouse = await warehouseRepository.findByIdForTenant(tenantId, warehouseId);
    if (!warehouse) {
      throw new AppError("RESOURCE_NOT_FOUND", "Warehouse not found");
    }
    return toWarehouseView(warehouse);
  },

  async create(dto: CreateWarehouseDto): Promise<WarehouseView> {
    try {
      const warehouse = await warehouseRepository.create({
        tenantId: dto.tenantId,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        state: dto.state,
        createdBy: dto.createdBy,
      });
      return toWarehouseView(warehouse);
    } catch (error) {
      throw toDuplicateCodeError(error);
    }
  },

  async update(dto: UpdateWarehouseDto): Promise<WarehouseView> {
    const existing = await warehouseRepository.findByIdForTenant(dto.tenantId, dto.warehouseId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Warehouse not found");
    }
    try {
      const warehouse = await warehouseRepository.update(dto.warehouseId, {
        name: dto.name,
        code: dto.code,
        address: dto.address,
        state: dto.state,
        updatedBy: dto.updatedBy,
      });
      return toWarehouseView(warehouse);
    } catch (error) {
      throw toDuplicateCodeError(error);
    }
  },

  async remove(tenantId: bigint, warehouseId: bigint, deletedBy?: bigint): Promise<void> {
    const existing = await warehouseRepository.findByIdForTenant(tenantId, warehouseId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Warehouse not found");
    }

    // Blocked, not cascaded — see DATABASE.md -> Foreign Key Rules. A
    // warehouse still holding stock or a registered POS terminal must be
    // emptied/reassigned first, not silently orphan that data.
    const [hasTerminals, hasStock] = await Promise.all([
      warehouseRepository.hasTerminals(warehouseId),
      warehouseRepository.hasStock(warehouseId),
    ]);
    if (hasTerminals || hasStock) {
      throw new AppError(
        "CONFLICT",
        "Cannot delete a warehouse that still has stock or registered terminals",
      );
    }

    await warehouseRepository.softDelete(warehouseId, deletedBy);
  },
};

function toDuplicateCodeError(error: unknown): AppError {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new AppError("DUPLICATE_CODE", "A warehouse with this code already exists");
  }
  return error instanceof AppError ? error : new AppError("INTERNAL_ERROR", "Unexpected error");
}

function toWarehouseView(warehouse: Warehouse): WarehouseView {
  return {
    id: warehouse.id.toString(),
    name: warehouse.name,
    code: warehouse.code,
    address: warehouse.address,
    state: warehouse.state,
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
  };
}
