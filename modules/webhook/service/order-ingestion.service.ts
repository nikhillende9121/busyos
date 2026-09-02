import { createHash } from "node:crypto";
import type { SaleChannel } from "@prisma/client";
import { idempotencyRepository } from "../repository/idempotency.repository";
import { productRepository } from "@/modules/product/repository/product.repository";
import { saleService } from "@/modules/sales/service/sale.service";
import { AppError } from "@/shared/errors/app-error";
import type { CreateInboundOrderDto } from "../dto/webhook.dto";
import type { SaleView } from "@/modules/sales/types/sale.types";

const IDEMPOTENCY_KEY_TTL_MS = 24 * 60 * 60 * 1000;

// POST /api/v1/integrations/orders — the tenant's own website pushing an
// order in. Reuses saleService.create() unchanged (same server-resolved
// pricing/tax/stock every other channel gets); this module's only job is
// mapping an external payload onto that existing call and guarding
// against duplicates. See Docs/webhooks.md §4.
export const orderIngestionService = {
  async createOrder(dto: CreateInboundOrderDto): Promise<SaleView> {
    if (dto.idempotencyKey) {
      const existing = await idempotencyRepository.findByTenantAndKey(dto.tenantId, dto.idempotencyKey);
      if (existing) {
        if (existing.requestHash !== dto.requestHash) {
          throw new AppError(
            "CONFLICT",
            "This Idempotency-Key was already used with a different request body",
          );
        }
        return existing.responseBody as unknown as SaleView;
      }
    }

    if (dto.externalOrderReference) {
      const existingSale = await saleService.findByWebhookOrigin(
        dto.tenantId,
        dto.integrationId,
        dto.externalOrderReference,
      );
      if (existingSale) {
        return existingSale;
      }
    }

    if (!dto.defaultWarehouseId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "No default online warehouse is configured for this integration — set one before sending orders",
      );
    }

    const items = [];
    for (const line of dto.items) {
      const product = await productRepository.findBySkuOrBarcode(dto.tenantId, line.skuOrBarcode);
      if (!product) {
        throw new AppError("RESOURCE_NOT_FOUND", `No product found for sku/barcode "${line.skuOrBarcode}"`);
      }
      items.push({ productId: product.id, quantity: line.quantity });
    }

    const sale = await saleService.create({
      tenantId: dto.tenantId,
      warehouseId: dto.defaultWarehouseId,
      channel: "ONLINE" as SaleChannel,
      saleDate: new Date(),
      items,
      customerId: dto.customerId ?? undefined,
      couponCode: dto.couponCode,
      webhookIntegrationId: dto.integrationId,
      externalOrderReference: dto.externalOrderReference,
    });

    if (dto.idempotencyKey) {
      await idempotencyRepository.create({
        tenantId: dto.tenantId,
        key: dto.idempotencyKey,
        requestHash: dto.requestHash,
        statusCode: 201,
        responseBody: sale as never,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_KEY_TTL_MS),
      });
    }

    return sale;
  },
};

export function hashRequestBody(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
