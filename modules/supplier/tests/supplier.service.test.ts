import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/supplier.repository", () => ({
  supplierRepository: {
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    softDelete: vi.fn(),
    hasPurchases: vi.fn(),
  },
}));

import { supplierRepository } from "../repository/supplier.repository";
import { supplierService } from "../service/supplier.service";

describe("supplierService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND for a supplier outside the tenant", async () => {
    vi.mocked(supplierRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(supplierService.remove(1n, 999n)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("blocks deletion of a supplier with existing purchase history", async () => {
    vi.mocked(supplierRepository.findByIdForTenant).mockResolvedValue({ id: 3n } as never);
    vi.mocked(supplierRepository.hasPurchases).mockResolvedValue(true);

    await expect(supplierService.remove(1n, 3n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(supplierRepository.softDelete).not.toHaveBeenCalled();
  });
});
