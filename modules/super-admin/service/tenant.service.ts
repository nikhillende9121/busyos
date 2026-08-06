import { Prisma } from "@prisma/client";
import type { Tenant } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { superAdminTenantRepository } from "../repository/tenant.repository";
import { roleService } from "@/modules/role/service/role.service";
import { userService } from "@/modules/user/service/user.service";
import { AppError } from "@/shared/errors/app-error";
import { uploadImage, destroyImage, cloudinaryImageUrl, CLOUDINARY_TRANSFORM } from "@/shared/utils/cloudinary";
import { assertValidImageFile } from "@/shared/utils/validate-image-file";
import { NON_INHERITABLE_PERMISSION_CODES } from "@/shared/constants/permissions";
import type {
  CreateTenantDto,
  UpdateTenantStatusDto,
  UploadTenantLogoDto,
  RemoveTenantLogoDto,
  ChangeTenantPlanDto,
} from "../dto/tenant.dto";
import type { SuperAdminTenantView } from "../types/tenant.types";

export const superAdminTenantService = {
  async list(): Promise<SuperAdminTenantView[]> {
    const tenants = await superAdminTenantRepository.findMany();
    return tenants.map(toTenantView);
  },

  async getById(tenantId: bigint): Promise<SuperAdminTenantView> {
    const tenant = await superAdminTenantRepository.findById(tenantId);
    if (!tenant) {
      throw new AppError("RESOURCE_NOT_FOUND", "Tenant not found");
    }
    return toTenantView(tenant);
  },

  // Bootstraps everything a tenant needs to actually be usable — without
  // this, a bare Tenant row would have no role or user able to ever log
  // into it. Deliberately NOT one giant atomic transaction: the Admin role
  // and admin user are created via roleService.create/userService.create,
  // which each run their own transaction — composing three independent
  // service-level transactions here rather than reimplementing their
  // bootstrap logic (permission validation, password hashing) inline.
  // Same multi-step (not single-transaction) shape prisma/seed.ts already
  // uses for the demo tenant — an accepted tradeoff for an admin/onboarding
  // operation, not a customer-facing hot path.
  async create(dto: CreateTenantDto): Promise<SuperAdminTenantView> {
    const plan = await superAdminTenantRepository.findPlanById(dto.planId);
    if (!plan) {
      throw new AppError("VALIDATION_ERROR", "planId does not exist");
    }

    let tenant: Tenant;
    try {
      tenant = await prisma.$transaction(async (tx) => {
        const created = await superAdminTenantRepository.create(tx, {
          name: dto.name,
          code: dto.code,
          status: "TRIAL",
        });

        await superAdminTenantRepository.createSetting(tx, {
          tenantId: created.id,
          currency: "INR",
          timezone: "Asia/Kolkata",
          decimalPrecision: 2,
        });

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
        await superAdminTenantRepository.createSubscription(tx, {
          tenantId: created.id,
          planId: dto.planId,
          startDate,
          endDate,
          status: "TRIAL",
        });

        const featureIds = plan.planFeatures.map((pf) => pf.featureId);
        if (featureIds.length > 0) {
          await superAdminTenantRepository.enableFeatures(tx, created.id, featureIds);
        }

        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("DUPLICATE_CODE", "A tenant with this code already exists");
      }
      throw error;
    }

    // STORE.ACCESS is excluded — it's a login-redirect signal, not a
    // capability, and a fresh tenant's Admin shouldn't silently start
    // landing on /store. See shared/constants/permissions.ts.
    const permissionCatalog = await roleService.listPermissionCatalog();
    const adminRole = await roleService.create({
      tenantId: tenant.id,
      name: "Admin",
      code: "ADMIN",
      permissionCodes: permissionCatalog
        .map((p) => p.code)
        .filter((code) => !NON_INHERITABLE_PERMISSION_CODES.has(code)),
    });

    await userService.create({
      tenantId: tenant.id,
      name: dto.adminName,
      email: dto.adminEmail,
      password: dto.adminPassword,
      roleId: BigInt(adminRole.id),
    });

    return toTenantView(tenant);
  },

  async updateStatus(dto: UpdateTenantStatusDto): Promise<SuperAdminTenantView> {
    const existing = await superAdminTenantRepository.findById(dto.tenantId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Tenant not found");
    }
    const tenant = await superAdminTenantRepository.updateStatus(dto.tenantId, dto.status);
    return toTenantView(tenant);
  },

  // Replaces, not appends — a tenant has exactly one logo, unlike a
  // product's image gallery. The old Cloudinary asset is destroyed first
  // so re-uploading never leaves an orphaned file behind.
  async uploadLogo(dto: UploadTenantLogoDto): Promise<SuperAdminTenantView> {
    const existing = await superAdminTenantRepository.findById(dto.tenantId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Tenant not found");
    }
    assertValidImageFile(dto.file);

    if (existing.logoPublicId) {
      await destroyImage(existing.logoPublicId);
    }
    const buffer = Buffer.from(await dto.file.arrayBuffer());
    const publicId = await uploadImage(buffer, dto.file.type, `tenants/${dto.tenantId}/logo`);
    const tenant = await superAdminTenantRepository.updateLogo(dto.tenantId, publicId);
    return toTenantView(tenant);
  },

  async removeLogo(dto: RemoveTenantLogoDto): Promise<SuperAdminTenantView> {
    const existing = await superAdminTenantRepository.findById(dto.tenantId);
    if (!existing) {
      throw new AppError("RESOURCE_NOT_FOUND", "Tenant not found");
    }
    if (!existing.logoPublicId) {
      return toTenantView(existing);
    }
    await destroyImage(existing.logoPublicId);
    const tenant = await superAdminTenantRepository.updateLogo(dto.tenantId, null);
    return toTenantView(tenant);
  },

  // Moves a tenant onto a different plan: cancels whatever ACTIVE/TRIAL
  // subscription it currently has (never deleted — TenantSubscription is
  // an append-only history, see DATABASE.md) and opens a new one on the
  // target plan, then resyncs its features to match. This is the only
  // place a tenant's plan can change after creation — see
  // Docs/business-rules/feature-catalog.md -> Changing a Tenant's Plan.
  async changePlan(dto: ChangeTenantPlanDto): Promise<SuperAdminTenantView> {
    const tenant = await superAdminTenantRepository.findById(dto.tenantId);
    if (!tenant) {
      throw new AppError("RESOURCE_NOT_FOUND", "Tenant not found");
    }
    const plan = await superAdminTenantRepository.findPlanById(dto.planId);
    if (!plan) {
      throw new AppError("VALIDATION_ERROR", "planId does not exist");
    }

    await prisma.$transaction(async (tx) => {
      const current = await superAdminTenantRepository.findActiveSubscription(dto.tenantId);
      if (current) {
        await superAdminTenantRepository.cancelSubscription(tx, current.id);
      }

      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
      await superAdminTenantRepository.createSubscription(tx, {
        tenantId: dto.tenantId,
        planId: dto.planId,
        startDate,
        endDate,
        status: "ACTIVE",
      });
    });

    await superAdminTenantService.resyncFeatures(dto.tenantId);
    return superAdminTenantService.getById(dto.tenantId);
  },

  // Recomputes a tenant's TenantFeature rows to match its current plan's
  // PlanFeature list exactly: enables anything the plan grants that isn't
  // already on, and disables anything currently on that the plan no
  // longer grants. Never deletes a row — a feature the tenant loses is
  // toggled `enabled: false`, not removed, so its history stays queryable.
  // Called after changePlan, and should also be called for every affected
  // tenant whenever a Plan's own feature list is edited — see
  // plan.service.ts's update().
  async resyncFeatures(tenantId: bigint): Promise<void> {
    const subscription = await superAdminTenantRepository.findActiveSubscription(tenantId);
    if (!subscription) {
      return;
    }
    const planFeatureIds = new Set(subscription.plan.planFeatures.map((pf) => pf.featureId.toString()));
    const currentlyEnabled = await superAdminTenantRepository.findEnabledFeatureIds(tenantId);
    const currentlyEnabledIds = new Set(currentlyEnabled.map((row) => row.featureId.toString()));

    const everyRelevantFeatureId = new Set([...planFeatureIds, ...currentlyEnabledIds]);
    for (const idString of everyRelevantFeatureId) {
      const featureId = BigInt(idString);
      await superAdminTenantRepository.setFeatureEnabled(prisma, tenantId, featureId, planFeatureIds.has(idString));
    }
  },
};

// `subscriptions` is only present when the row came from findMany/findById
// (see tenant.repository.ts's includeCurrentPlan) — updateStatus/
// updateLogo/create's own mutation result don't carry it, so this field
// is optional and simply omitted (never wrongly shown as "no plan") for
// those call sites' immediate response; the list is invalidated and
// refetched afterward anyway.
function toTenantView(
  tenant: Tenant & { subscriptions?: { plan: { id: bigint; name: string } }[] },
): SuperAdminTenantView {
  const currentPlan = tenant.subscriptions?.[0]?.plan ?? null;
  return {
    id: tenant.id.toString(),
    name: tenant.name,
    code: tenant.code,
    status: tenant.status,
    logoUrl: tenant.logoPublicId ? cloudinaryImageUrl(tenant.logoPublicId, CLOUDINARY_TRANSFORM.logo) : null,
    currentPlanId: currentPlan ? currentPlan.id.toString() : null,
    currentPlanName: currentPlan ? currentPlan.name : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}
