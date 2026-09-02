import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/idempotency.repository", () => ({
  idempotencyRepository: {
    findByTenantAndKey: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/modules/product/repository/product.repository", () => ({
  productRepository: {
    findBySkuOrBarcode: vi.fn(),
  },
}));

vi.mock("@/modules/sales/service/sale.service", () => ({
  saleService: {
    create: vi.fn(),
    findByWebhookOrigin: vi.fn(),
  },
}));

import { idempotencyRepository } from "../repository/idempotency.repository";
import { productRepository } from "@/modules/product/repository/product.repository";
import { saleService } from "@/modules/sales/service/sale.service";
import { orderIngestionService } from "../service/order-ingestion.service";

const BASE_DTO = {
  tenantId: 1n,
  integrationId: 5n,
  defaultWarehouseId: 3n,
  requestHash: "hash-abc",
  items: [{ skuOrBarcode: "SKU-1", quantity: "2" }],
};

describe("orderIngestionService.createOrder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(idempotencyRepository.findByTenantAndKey).mockResolvedValue(null);
    vi.mocked(saleService.findByWebhookOrigin).mockResolvedValue(null);
    vi.mocked(productRepository.findBySkuOrBarcode).mockResolvedValue({ id: 100n } as never);
    vi.mocked(saleService.create).mockResolvedValue({ id: "42" } as never);
  });

  it("replays the stored response when the same Idempotency-Key + request hash is reused, without creating a new sale", async () => {
    vi.mocked(idempotencyRepository.findByTenantAndKey).mockResolvedValue({
      requestHash: "hash-abc",
      responseBody: { id: "42", replayed: true },
    } as never);

    const result = await orderIngestionService.createOrder({ ...BASE_DTO, idempotencyKey: "key-1" });

    expect(result).toEqual({ id: "42", replayed: true });
    expect(saleService.create).not.toHaveBeenCalled();
  });

  it("rejects reusing an Idempotency-Key with a different request body", async () => {
    vi.mocked(idempotencyRepository.findByTenantAndKey).mockResolvedValue({
      requestHash: "different-hash",
      responseBody: {},
    } as never);

    await expect(
      orderIngestionService.createOrder({ ...BASE_DTO, idempotencyKey: "key-1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(saleService.create).not.toHaveBeenCalled();
  });

  it("returns the existing sale instead of creating a duplicate when externalOrderReference already matches one", async () => {
    vi.mocked(saleService.findByWebhookOrigin).mockResolvedValue({ id: "42" } as never);

    const result = await orderIngestionService.createOrder({
      ...BASE_DTO,
      externalOrderReference: "SHOP-1001",
    });

    expect(result).toEqual({ id: "42" });
    expect(saleService.create).not.toHaveBeenCalled();
  });

  it("rejects when no default warehouse is configured for the integration", async () => {
    await expect(
      orderIngestionService.createOrder({ ...BASE_DTO, defaultWarehouseId: null }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(saleService.create).not.toHaveBeenCalled();
  });

  it("throws RESOURCE_NOT_FOUND naming the unmatched sku/barcode", async () => {
    vi.mocked(productRepository.findBySkuOrBarcode).mockResolvedValue(null);

    await expect(orderIngestionService.createOrder(BASE_DTO)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
    expect(saleService.create).not.toHaveBeenCalled();
  });

  it("creates the sale via saleService.create with channel ONLINE and no price field on any item", async () => {
    await orderIngestionService.createOrder({ ...BASE_DTO, externalOrderReference: "SHOP-1001" });

    expect(saleService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 1n,
        warehouseId: 3n,
        channel: "ONLINE",
        webhookIntegrationId: 5n,
        externalOrderReference: "SHOP-1001",
        items: [{ productId: 100n, quantity: "2" }],
      }),
    );
    const call = vi.mocked(saleService.create).mock.calls[0][0] as Record<string, unknown>;
    expect(call.items).toEqual([{ productId: 100n, quantity: "2" }]);
    expect((call.items as Record<string, unknown>[])[0]).not.toHaveProperty("price");
  });

  it("persists an idempotency key after a successful creation when one was provided", async () => {
    await orderIngestionService.createOrder({ ...BASE_DTO, idempotencyKey: "key-1" });

    expect(idempotencyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 1n, key: "key-1", requestHash: "hash-abc", statusCode: 201 }),
    );
  });

  it("does not persist an idempotency key when none was provided", async () => {
    await orderIngestionService.createOrder(BASE_DTO);

    expect(idempotencyRepository.create).not.toHaveBeenCalled();
  });
});
