import type { DiscountType, PromotionScope } from "@prisma/client";

export type CreateDiscountDto = {
  tenantId: bigint;
  name: string;
  type: DiscountType;
  value: string;
  scope: PromotionScope;
  warehouseId?: bigint;
  customerGroupId?: bigint;
  customerId?: bigint;
  productIds?: bigint[];
  categoryIds?: bigint[];
  minPurchaseAmount?: string;
  maxDiscountAmount?: string;
  startDate: Date;
  endDate?: Date;
  stackable?: boolean;
  priority?: number;
};

export type DiscountListDto = {
  tenantId: bigint;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
};

export type DiscountExportDto = {
  tenantId: bigint;
  dateFrom?: Date;
  dateTo?: Date;
};
