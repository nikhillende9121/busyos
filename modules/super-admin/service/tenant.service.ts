import { Prisma } from "@prisma/client";
import type { Tenant } from "@prisma/client";
import { prisma } from "@/shared/database/prisma";
import { superAdminTenantRepository } from "../repository/tenant.repository";
import { roleService } from "@/modules/role/service/role.service";
import { userService } from "@/modules/user/service/user.service";
import { AppError } from "@/shared/errors/app-error";
import { uploadImage, destroyImage, cloudinaryImageUrl, CLOUDINARY_TRANSFORM } from "@/shared/utils/cloudinary";
import { assertValidImageFile } from "@/shared/utils/validate-image-file";
import type {
  CreateTenantDto,
  UpdateTenantStatusDto,
  UploadTenantLogoDto,
  RemoveTenantLogoDto,
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

    const permissionCatalog = await roleService.listPermissionCatalog();
    const adminRole = await roleService.create({
      tenantId: tenant.id,
      name: "Admin",
      code: "ADMIN",
      permissionCodes: permissionCatalog.map((p) => p.code),
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
};

function toTenantView(tenant: Tenant): SuperAdminTenantView {
  return {
    id: tenant.id.toString(),
    name: tenant.name,
    code: tenant.code,
    status: tenant.status,
    logoUrl: tenant.logoPublicId ? cloudinaryImageUrl(tenant.logoPublicId, CLOUDINARY_TRANSFORM.logo) : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}
