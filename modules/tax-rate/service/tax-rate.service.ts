import { Prisma } from "@prisma/client";
import type { TaxRate } from "@prisma/client";
import { taxRateRepository } from "../repository/tax-rate.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreateTaxRateDto, UpdateTaxRateDto } from "../dto/tax-rate.dto";
import type { TaxRateView } from "../types/tax-rate.types";

export const taxRateService = {
  async list(tenantId: bigint): Promise<TaxRateView[]> {
    const rates = await taxRateRepository.findManyByTenant(tenantId);
    return rates.map(toTaxRateView);
  },

  async getById(tenantId: bigint, taxRateId: bigint): Promise<TaxRateView> {
    const rate = await taxRateRepository.findByIdForTenant(tenantId, taxRateId);
    if (!rate) {
      throw new AppError("RESOURCE_NOT_FOUND", "Tax rate not found");
    }
    return toTaxRateView(rate);
  },

  async create(dto: CreateTaxRateDto): Promise<TaxRateView> {
    const rate = await taxRateRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      hsnCode: dto.hsnCode,
      sacCode: dto.sacCode,
      ratePercent: new Prisma.Decimal(dto.ratePercent),
      cessPercent: new Prisma.Decimal(dto.cessPercent ?? "0"),
      createdBy: dto.createdBy,
    });
    return toTaxRateView(rate);
  },

  async update(dto: UpdateTaxRateDto): Promise<TaxRateView> {
    const existing = await taxRateRepository.findByIdForTenant(dto.tenantId, dto.taxRateId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Tax rate not found");
    }
    const rate = await taxRateRepository.update(dto.taxRateId, {
      name: dto.name,
      hsnCode: dto.hsnCode,
      sacCode: dto.sacCode,
      ratePercent: dto.ratePercent !== undefined ? new Prisma.Decimal(dto.ratePercent) : undefined,
      cessPercent: dto.cessPercent !== undefined ? new Prisma.Decimal(dto.cessPercent) : undefined,
      isActive: dto.isActive,
      updatedBy: dto.updatedBy,
    });
    return toTaxRateView(rate);
  },

  async remove(tenantId: bigint, taxRateId: bigint, deletedBy?: bigint): Promise<void> {
    const existing = await taxRateRepository.findByIdForTenant(tenantId, taxRateId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Tax rate not found");
    }
    if (await taxRateRepository.hasProductsUsingRate(taxRateId)) {
      throw new AppError("CONFLICT", "Cannot delete a tax rate still assigned to one or more products");
    }
    await taxRateRepository.softDelete(taxRateId, deletedBy);
  },
};

function toTaxRateView(rate: TaxRate): TaxRateView {
  return {
    id: rate.id.toString(),
    name: rate.name,
    hsnCode: rate.hsnCode,
    sacCode: rate.sacCode,
    ratePercent: rate.ratePercent.toString(),
    cessPercent: rate.cessPercent.toString(),
    isActive: rate.isActive,
    createdAt: rate.createdAt.toISOString(),
    updatedAt: rate.updatedAt.toISOString(),
  };
}
