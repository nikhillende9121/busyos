import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/shared/database/prisma";
import { NON_INHERITABLE_PERMISSION_CODES } from "@/shared/constants/permissions";

// Idempotent: every upsert keys off a real unique constraint (see
// prisma/schema.prisma), so re-running this after the schema changes is
// safe and won't create duplicates. Run via `npm run db:seed` or
// automatically after `prisma migrate dev` (wired in prisma.config.ts).
//
// Codes below are pulled directly from every `permission`/`feature` string
// actually used across app/api/**/route.ts — keep this list in sync when a
// new module adds a new code, or its routes will 403 with no role able to
// grant them.
const PERMISSION_CODES = [
  "BRAND.CREATE", "BRAND.DELETE", "BRAND.UPDATE", "BRAND.VIEW",
  "CATEGORY.CREATE", "CATEGORY.DELETE", "CATEGORY.UPDATE", "CATEGORY.VIEW",
  "COUPON.CREATE", "COUPON.VIEW",
  "CUSTOMER.CREATE", "CUSTOMER.DELETE", "CUSTOMER.UPDATE", "CUSTOMER.VIEW",
  "CUSTOMER_GROUP.CREATE", "CUSTOMER_GROUP.DELETE", "CUSTOMER_GROUP.UPDATE", "CUSTOMER_GROUP.VIEW",
  "DISCOUNT.CREATE", "DISCOUNT.VIEW",
  "EXTRA_CHARGE.CREATE", "EXTRA_CHARGE.DELETE", "EXTRA_CHARGE.UPDATE", "EXTRA_CHARGE.VIEW",
  "INVENTORY.ADJUST", "INVENTORY.VIEW",
  "PRICE_LIST.CREATE", "PRICE_LIST.VIEW",
  "PRODUCT.CREATE", "PRODUCT.DELETE", "PRODUCT.UPDATE", "PRODUCT.VIEW",
  "PURCHASE.CREATE", "PURCHASE.RECEIVE", "PURCHASE.UPDATE", "PURCHASE.VIEW",
  "PURCHASE_RETURN.CREATE", "PURCHASE_RETURN.VIEW",
  "REPORT.VIEW",
  "ROLE.CREATE", "ROLE.DELETE", "ROLE.UPDATE", "ROLE.VIEW",
  "SALE.CANCEL", "SALE.COMPLETE", "SALE.CONFIRM", "SALE.CREATE", "SALE.DELIVER", "SALE.EXCHANGE", "SALE.PACK", "SALE.PROCESS", "SALE.SHIP", "SALE.UPDATE", "SALE.VIEW",
  "SALE_RETURN.CREATE", "SALE_RETURN.VIEW",
  "STOCK_TRANSFER.APPROVE", "STOCK_TRANSFER.CREATE", "STOCK_TRANSFER.RECEIVE", "STOCK_TRANSFER.SHIP", "STOCK_TRANSFER.UPDATE", "STOCK_TRANSFER.VIEW",
  "STORE.ACCESS",
  "SUPPLIER.CREATE", "SUPPLIER.DELETE", "SUPPLIER.UPDATE", "SUPPLIER.VIEW",
  "TAX_RATE.CREATE", "TAX_RATE.DELETE", "TAX_RATE.UPDATE", "TAX_RATE.VIEW",
  "TENANT.UPDATE_SETTINGS", "TENANT.VIEW",
  "UNIT.CREATE", "UNIT.DELETE", "UNIT.UPDATE", "UNIT.VIEW",
  "USER.CREATE", "USER.DELETE", "USER.UPDATE", "USER.VIEW",
  "WAREHOUSE.CREATE", "WAREHOUSE.DELETE", "WAREHOUSE.UPDATE", "WAREHOUSE.VIEW",
];

// Module-level feature gates — see shared/middleware/with-api-auth.ts's
// Feature Validation step and Docs/business-rules/feature-catalog.md.
// PRODUCT/INVENTORY/PURCHASE/SALES are the original four; everything else
// was split out of one of those so a Plan can grant e.g. Purchasing
// without Purchase Returns. ROLE/USER/TENANT-settings stay ungated on
// purpose — see feature-catalog.md for why gating core tenant
// administration is a support risk, not a real pricing tier.
// `name` is shown as-is to a tenant admin (Subscription card on
// app/(dashboard)/settings/page.tsx) — keep it a short human label, not
// the raw code.
const FEATURE_LABELS: Record<string, string> = {
  PRODUCT: "Product Catalog",
  CATEGORY: "Categories",
  BRAND: "Brands",
  UNIT: "Units of Measure",
  SUPPLIER: "Suppliers",
  CUSTOMER: "Customers",
  CUSTOMER_GROUP: "Customer Groups",
  PURCHASE: "Purchasing",
  PURCHASE_RETURN: "Purchase Returns",
  SALES: "Sales / POS",
  SALE_RETURN: "Sale Returns",
  SALE_EXCHANGE: "Sale Exchanges",
  PRICE_LIST: "Price Lists",
  DISCOUNT: "Discounts",
  COUPON: "Coupons",
  INVENTORY: "Inventory & Adjustments",
  STOCK_TRANSFER: "Stock Transfers",
  EXTRA_CHARGE: "Extra Charges",
  GST_REPORT: "GST Report",
};
const FEATURE_CODES = Object.keys(FEATURE_LABELS);

const DEMO_TENANT_CODE = "demo";
const DEMO_ADMIN_EMAIL = "admin@demo.test";
const DEMO_ADMIN_PASSWORD = "Password123!";

const DEMO_SUPER_ADMIN_EMAIL = "root@platform.test";
const DEMO_SUPER_ADMIN_PASSWORD = "SuperSecret123!";

async function main() {
  console.log(`Upserting demo Super Admin (${DEMO_SUPER_ADMIN_EMAIL})...`);
  await prisma.superAdmin.upsert({
    where: { email: DEMO_SUPER_ADMIN_EMAIL },
    create: {
      name: "Platform Root",
      email: DEMO_SUPER_ADMIN_EMAIL,
      password: await bcrypt.hash(DEMO_SUPER_ADMIN_PASSWORD, 12),
      status: "ACTIVE",
    },
    update: {},
  });

  console.log("Upserting permission catalog...");
  for (const code of PERMISSION_CODES) {
    const [module, action] = code.split(".");
    await prisma.permission.upsert({
      where: { code },
      create: { module, action, code },
      update: {},
    });
  }

  console.log("Upserting feature catalog...");
  const featureIds = new Map<string, bigint>();
  for (const code of FEATURE_CODES) {
    const name = FEATURE_LABELS[code];
    const feature = await prisma.feature.upsert({
      where: { code },
      create: { name, code },
      update: { name },
    });
    featureIds.set(code, feature.id);
  }

  console.log("Ensuring a demo plan with every feature...");
  // Plan has no natural unique key (see prisma/schema.prisma) — findFirst
  // + create-if-missing instead of upsert, same reason Tenant/Role/User/
  // Warehouse below use upsert (they DO have one).
  let plan = await prisma.plan.findFirst({ where: { name: "Demo All-Inclusive" } });
  if (!plan) {
    plan = await prisma.plan.create({
      data: { name: "Demo All-Inclusive", price: "0", billingCycle: "MONTHLY" },
    });
  }
  for (const featureId of featureIds.values()) {
    await prisma.planFeature.upsert({
      where: { planId_featureId: { planId: plan.id, featureId } },
      create: { planId: plan.id, featureId },
      update: {},
    });
  }

  console.log(`Upserting demo tenant (code="${DEMO_TENANT_CODE}")...`);
  const tenant = await prisma.tenant.upsert({
    where: { code: DEMO_TENANT_CODE },
    create: { name: "Demo Retail Co", code: DEMO_TENANT_CODE, status: "ACTIVE" },
    update: {},
  });

  await prisma.tenantSetting.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      companyName: "Demo Retail Co",
      currency: "INR",
      timezone: "Asia/Kolkata",
      invoicePrefix: "DEMO-",
      decimalPrecision: 2,
    },
    update: {},
  });

  const existingSubscription = await prisma.tenantSubscription.findFirst({
    where: { tenantId: tenant.id },
  });
  if (!existingSubscription) {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1);
    await prisma.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        startDate,
        endDate,
        status: "ACTIVE",
        priceAtSigning: plan.price,
      },
    });
  }

  for (const featureId of featureIds.values()) {
    await prisma.tenantFeature.upsert({
      where: { tenantId_featureId: { tenantId: tenant.id, featureId } },
      create: { tenantId: tenant.id, featureId, enabled: true },
      update: { enabled: true },
    });
  }

  console.log("Upserting an Admin role with every permission granted...");
  const role = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "ADMIN" } },
    create: { tenantId: tenant.id, name: "Admin", code: "ADMIN" },
    update: {},
  });

  const allPermissions = await prisma.permission.findMany();
  for (const permission of allPermissions) {
    if (NON_INHERITABLE_PERMISSION_CODES.has(permission.code)) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { roleId: role.id, permissionId: permission.id },
      update: {},
    });
  }

  console.log(`Upserting demo admin user (${DEMO_ADMIN_EMAIL})...`);
  const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 12);
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: DEMO_ADMIN_EMAIL } },
    create: {
      tenantId: tenant.id,
      roleId: role.id,
      name: "Demo Admin",
      email: DEMO_ADMIN_EMAIL,
      password: passwordHash,
      status: "ACTIVE",
    },
    update: {},
  });

  console.log("Upserting a demo warehouse...");
  await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "MAIN" } },
    create: { tenantId: tenant.id, name: "Main Warehouse", code: "MAIN" },
    update: {},
  });

  console.log("\nSeed complete. Log in with:");
  console.log(`  tenantCode: ${DEMO_TENANT_CODE}`);
  console.log(`  email:      ${DEMO_ADMIN_EMAIL}`);
  console.log(`  password:   ${DEMO_ADMIN_PASSWORD}`);
  console.log("\nOr as Super Admin (no tenantCode — platform-level, /super-admin/login):");
  console.log(`  email:      ${DEMO_SUPER_ADMIN_EMAIL}`);
  console.log(`  password:   ${DEMO_SUPER_ADMIN_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
