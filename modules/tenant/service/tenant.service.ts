import { tenantRepository } from "../repository/tenant.repository";
import { AppError } from "@/shared/errors/app-error";
import type { UpdateTenantSettingsDto } from "../dto/tenant.dto";
import type { TenantProfile, TenantSubscriptionView } from "../types/tenant.types";
import type { Tenant, TenantSetting, TenantSubscription, Plan, PlanFeature, Feature } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  async getSubscription(tenantId: bigint): Promise<TenantSubscriptionView | null> {
    const subscription = await tenantRepository.findActiveSubscriptionWithPlan(tenantId);
    if (!subscription) {
      return null;
    }
    return toSubscriptionView(subscription);
  },
};

function toSubscriptionView(
  subscription: TenantSubscription & {
    plan: Plan & { planFeatures: (PlanFeature & { feature: Feature })[] };
  },
): TenantSubscriptionView {
  const isExpiredByDate = subscription.endDate.getTime() < Date.now();
  return {
    status: subscription.status,
    isExpiredByDate,
    startDate: subscription.startDate.toISOString(),
    endDate: subscription.endDate.toISOString(),
    daysRemaining: Math.ceil((subscription.endDate.getTime() - Date.now()) / DAY_MS),
    priceAtSigning: subscription.priceAtSigning.toString(),
    plan: {
      name: subscription.plan.name,
      billingCycle: subscription.plan.billingCycle,
      maxWarehouses: subscription.plan.maxWarehouses,
      maxUsers: subscription.plan.maxUsers,
      maxRoles: subscription.plan.maxRoles,
    },
    features: subscription.plan.planFeatures.map((pf) => ({ code: pf.feature.code, name: pf.feature.name })),
  };
}

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
