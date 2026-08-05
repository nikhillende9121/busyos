import type { Unit } from "@prisma/client";
import { unitRepository } from "../repository/unit.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreateUnitDto, UpdateUnitDto } from "../dto/unit.dto";
import type { UnitView } from "../types/unit.types";

export const unitService = {
  async list(tenantId: bigint): Promise<UnitView[]> {
    const units = await unitRepository.findManyVisibleToTenant(tenantId);
    return units.map(toUnitView);
  },

  async getById(tenantId: bigint, unitId: bigint): Promise<UnitView> {
    const unit = await unitRepository.findVisibleToTenant(tenantId, unitId);
    if (!unit) {
      throw new AppError("RESOURCE_NOT_FOUND", "Unit not found");
    }
    return toUnitView(unit);
  },

  async create(dto: CreateUnitDto): Promise<UnitView> {
    const unit = await unitRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      symbol: dto.symbol,
    });
    return toUnitView(unit);
  },

  async update(dto: UpdateUnitDto): Promise<UnitView> {
    // Only a tenant's own units are writable — the shared system catalog is
    // Super Admin-managed. A tenant asking to edit unitId=<shared unit>
    // gets RESOURCE_NOT_FOUND (found via findVisibleToTenant it would be
    // visible, but findOwnedByTenant correctly reports "not yours"), the
    // same response shape as a genuinely nonexistent id — see
    // Docs/API_STANDARDS.md on not distinguishing "not found" from
    // "not yours" in the response.
    const existing = await unitRepository.findOwnedByTenant(dto.tenantId, dto.unitId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Unit not found");
    }
    const unit = await unitRepository.update(dto.unitId, { name: dto.name, symbol: dto.symbol });
    return toUnitView(unit);
  },

  async remove(tenantId: bigint, unitId: bigint): Promise<void> {
    const existing = await unitRepository.findOwnedByTenant(tenantId, unitId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Unit not found");
    }
    const inUse = await unitRepository.hasProducts(unitId);
    if (inUse) {
      throw new AppError("CONFLICT", "Cannot delete a unit that is still assigned to products");
    }
    await unitRepository.hardDelete(unitId);
  },
};

function toUnitView(unit: Unit): UnitView {
  return {
    id: unit.id.toString(),
    name: unit.name,
    symbol: unit.symbol,
    isShared: unit.tenantId === null,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  };
}
