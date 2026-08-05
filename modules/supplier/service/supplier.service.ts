import type { Supplier } from "@prisma/client";
import { supplierRepository } from "../repository/supplier.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreateSupplierDto, UpdateSupplierDto } from "../dto/supplier.dto";
import type { SupplierView } from "../types/supplier.types";

export const supplierService = {
  async list(tenantId: bigint): Promise<SupplierView[]> {
    const suppliers = await supplierRepository.findManyByTenant(tenantId);
    return suppliers.map(toSupplierView);
  },

  async getById(tenantId: bigint, supplierId: bigint): Promise<SupplierView> {
    const supplier = await supplierRepository.findByIdForTenant(tenantId, supplierId);
    if (!supplier) {
      throw new AppError("RESOURCE_NOT_FOUND", "Supplier not found");
    }
    return toSupplierView(supplier);
  },

  async create(dto: CreateSupplierDto): Promise<SupplierView> {
    const supplier = await supplierRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      state: dto.state,
    });
    return toSupplierView(supplier);
  },

  async update(dto: UpdateSupplierDto): Promise<SupplierView> {
    const existing = await supplierRepository.findByIdForTenant(dto.tenantId, dto.supplierId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Supplier not found");
    }
    const supplier = await supplierRepository.update(dto.supplierId, {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      state: dto.state,
    });
    return toSupplierView(supplier);
  },

  async remove(tenantId: bigint, supplierId: bigint): Promise<void> {
    const existing = await supplierRepository.findByIdForTenant(tenantId, supplierId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Supplier not found");
    }
    // Blocked, not cascaded — see DATABASE.md -> Foreign Key Rules. A
    // supplier with purchase history must be kept for that history's
    // referential integrity; cancel/soft-delete purchases first if the
    // relationship is truly ending.
    const inUse = await supplierRepository.hasPurchases(supplierId);
    if (inUse) {
      throw new AppError("CONFLICT", "Cannot delete a supplier that has existing purchases");
    }
    await supplierRepository.softDelete(supplierId);
  },
};

function toSupplierView(supplier: Supplier): SupplierView {
  return {
    id: supplier.id.toString(),
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    state: supplier.state,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}
