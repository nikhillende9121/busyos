import { Prisma } from "@prisma/client";
import type { ExtraCharge } from "@prisma/client";
import { extraChargeRepository } from "../repository/extra-charge.repository";
import { AppError } from "@/shared/errors/app-error";
import type { CreateExtraChargeDto, UpdateExtraChargeDto } from "../dto/extra-charge.dto";
import type { ExtraChargeView } from "../types/extra-charge.types";

export const extraChargeService = {
  async list(tenantId: bigint): Promise<ExtraChargeView[]> {
    const charges = await extraChargeRepository.findManyByTenant(tenantId);
    return charges.map(toExtraChargeView);
  },

  async getById(tenantId: bigint, extraChargeId: bigint): Promise<ExtraChargeView> {
    const charge = await extraChargeRepository.findByIdForTenant(tenantId, extraChargeId);
    if (!charge) {
      throw new AppError("RESOURCE_NOT_FOUND", "Extra charge not found");
    }
    return toExtraChargeView(charge);
  },

  async create(dto: CreateExtraChargeDto): Promise<ExtraChargeView> {
    const isTaxable = dto.isTaxable ?? false;
    if (isTaxable) {
      if (!dto.taxRateId) {
        throw new AppError("VALIDATION_ERROR", "taxRateId is required when isTaxable is true");
      }
      const taxRate = await extraChargeRepository.findTaxRateForTenant(dto.tenantId, dto.taxRateId);
      if (!taxRate) {
        throw new AppError("VALIDATION_ERROR", "taxRateId does not belong to this tenant");
      }
    }

    const charge = await extraChargeRepository.create({
      tenantId: dto.tenantId,
      name: dto.name,
      calcType: dto.calcType,
      value: new Prisma.Decimal(dto.value),
      isTaxable,
      taxRateId: isTaxable && dto.taxRateId ? dto.taxRateId : null,
      applicableChannels: dto.applicableChannels?.length ? dto.applicableChannels.join(",") : null,
      createdBy: dto.createdBy,
    });
    return toExtraChargeView(charge);
  },

  async update(dto: UpdateExtraChargeDto): Promise<ExtraChargeView> {
    const existing = await extraChargeRepository.findByIdForTenant(dto.tenantId, dto.extraChargeId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Extra charge not found");
    }

    const effectiveIsTaxable = dto.isTaxable ?? existing.isTaxable;
    const effectiveTaxRateId = dto.taxRateId !== undefined ? dto.taxRateId : existing.taxRateId;
    if (effectiveIsTaxable) {
      if (!effectiveTaxRateId) {
        throw new AppError("VALIDATION_ERROR", "taxRateId is required when isTaxable is true");
      }
      if (dto.taxRateId) {
        const taxRate = await extraChargeRepository.findTaxRateForTenant(dto.tenantId, dto.taxRateId);
        if (!taxRate) {
          throw new AppError("VALIDATION_ERROR", "taxRateId does not belong to this tenant");
        }
      }
    }

    const charge = await extraChargeRepository.update(dto.extraChargeId, {
      name: dto.name,
      calcType: dto.calcType,
      value: dto.value !== undefined ? new Prisma.Decimal(dto.value) : undefined,
      isTaxable: dto.isTaxable,
      taxRateId: effectiveIsTaxable ? effectiveTaxRateId : null,
      isActive: dto.isActive,
      applicableChannels: dto.applicableChannels !== undefined
        ? (dto.applicableChannels?.length ? dto.applicableChannels.join(",") : null)
        : undefined,
      updatedBy: dto.updatedBy,
    });
    return toExtraChargeView(charge);
  },

  async remove(tenantId: bigint, extraChargeId: bigint, deletedBy?: bigint): Promise<void> {
    const existing = await extraChargeRepository.findByIdForTenant(tenantId, extraChargeId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Extra charge not found");
    }
    // Not blocked on historical use — SaleCharge/PurchaseCharge snapshot the
    // name/amount at attach-time and their extraChargeId is SetNull, so a
    // retired charge doesn't orphan or corrupt past invoices.
    await extraChargeRepository.softDelete(extraChargeId, deletedBy);
  },
};

function toExtraChargeView(charge: ExtraCharge): ExtraChargeView {
  return {
    id: charge.id.toString(),
    name: charge.name,
    calcType: charge.calcType,
    value: charge.value.toString(),
    isTaxable: charge.isTaxable,
    taxRateId: charge.taxRateId?.toString() ?? null,
    isActive: charge.isActive,
    applicableChannels: charge.applicableChannels
      ? charge.applicableChannels.split(",").filter(Boolean)
      : null,
    createdAt: charge.createdAt.toISOString(),
    updatedAt: charge.updatedAt.toISOString(),
  };
}
