import { tenantRepository } from "../repository/tenant.repository";
import { AppError } from "@/shared/errors/app-error";
import type { UpdateTenantSettingsDto } from "../dto/tenant.dto";
import type { TenantProfile } from "../types/tenant.types";
import type { Tenant, TenantSetting } from "@prisma/client";

export const tenantService = {
  async getProfile(tenantId: bigint): Promise<TenantProfile> {
    const tenant = await tenantRepository.findByIdWithSettings(tenantId);
    if (!tenant) {
      // Reached only if a valid, still-active JWT somehow points at a
      // tenant row that's gone — the request pipeline's Subscription
      // Validation step already confirmed the tenant exists and is active
      // before this service runs (see shared/middleware/with-api-auth.ts).
      throw new AppError("RESOURCE_NOT_FOUND", "Tenant not found");
    }
    return toTenantProfile(tenant);
  },

  async updateSettings(dto: UpdateTenantSettingsDto): Promise<TenantProfile> {
    const { tenantId, ...settings } = dto;
    if (settings.defaultTaxRateId) {
      const taxRate = await tenantRepository.findTaxRateForTenant(tenantId, settings.defaultTaxRateId);
      if (!taxRate) {
        throw new AppError("VALIDATION_ERROR", "defaultTaxRateId does not belong to this tenant");
      }
    }
    await tenantRepository.upsertSettings(tenantId, settings);
    return tenantService.getProfile(tenantId);
  },
};

function toTenantProfile(
  tenant: Tenant & { settings: TenantSetting | null },
): TenantProfile {
  return {
    id: tenant.id.toString(),
    name: tenant.name,
    code: tenant.code,
    status: tenant.status,
    settings: tenant.settings
      ? {
          companyName: tenant.settings.companyName,
          gstNumber: tenant.settings.gstNumber,
          currency: tenant.settings.currency,
          timezone: tenant.settings.timezone,
          invoicePrefix: tenant.settings.invoicePrefix,
          decimalPrecision: tenant.settings.decimalPrecision,
          homeState: tenant.settings.homeState,
          taxInclusivePricing: tenant.settings.taxInclusivePricing,
          defaultTaxRateId: tenant.settings.defaultTaxRateId?.toString() ?? null,
        }
      : null,
  };
}
