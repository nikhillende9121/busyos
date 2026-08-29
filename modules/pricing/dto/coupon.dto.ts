import type { CouponType, PromotionScope } from "@prisma/client";

export type CreateCouponDto = {
  tenantId: bigint;
  code: string;
  type: CouponType;
  value: string;
  scope: PromotionScope;
  warehouseId?: bigint;
  customerGroupId?: bigint;
  customerId?: bigint;
  productIds?: bigint[];
  categoryIds?: bigint[];
  minPurchaseAmount?: string;
  maxDiscountAmount?: string;
  usageLimitTotal?: number;
  usageLimitPerCustomer?: number;
  startDate: Date;
  endDate?: Date;
  stackable?: boolean;
};

export type CouponListDto = {
  tenantId: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
};

export type CouponExportDto = {
  tenantId: bigint;
  dateFrom?: Date;
  dateTo?: Date;
};
