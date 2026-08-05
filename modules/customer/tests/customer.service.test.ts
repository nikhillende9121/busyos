import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/customer.repository", () => ({
  customerRepository: {
    findByIdForTenant: vi.fn(),
    create: vi.fn(),
    softDelete: vi.fn(),
    hasSales: vi.fn(),
  },
}));

import { customerRepository } from "../repository/customer.repository";
import { customerService } from "../service/customer.service";

describe("customerService.remove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws RESOURCE_NOT_FOUND for a customer outside the tenant", async () => {
    vi.mocked(customerRepository.findByIdForTenant).mockResolvedValue(null);

    await expect(customerService.remove(1n, 999n)).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("blocks deletion of a customer with existing sales history", async () => {
    vi.mocked(customerRepository.findByIdForTenant).mockResolvedValue({ id: 3n } as never);
    vi.mocked(customerRepository.hasSales).mockResolvedValue(true);

    await expect(customerService.remove(1n, 3n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(customerRepository.softDelete).not.toHaveBeenCalled();
  });
});
