import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/customer-group.repository", () => ({
  customerGroupRepository: {
    findByIdForTenant: vi.fn(),
    hardDelete: vi.fn(),
    hasCustomers: vi.fn(),
    hasPriceLists: vi.fn(),
    hasDiscounts: vi.fn(),
    hasCoupons: vi.fn(),
  },
}));

import { customerGroupRepository } from "../repository/customer-group.repository";
import { customerGroupService } from "../service/customer-group.service";

describe("customerGroupService.remove", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(customerGroupRepository.findByIdForTenant).mockResolvedValue({ id: 5n } as never);
    vi.mocked(customerGroupRepository.hasCustomers).mockResolvedValue(false);
    vi.mocked(customerGroupRepository.hasPriceLists).mockResolvedValue(false);
    vi.mocked(customerGroupRepository.hasDiscounts).mockResolvedValue(false);
    vi.mocked(customerGroupRepository.hasCoupons).mockResolvedValue(false);
  });

  it("deletes a group with no dependents", async () => {
    await customerGroupService.remove(1n, 5n);
    expect(customerGroupRepository.hardDelete).toHaveBeenCalledWith(5n);
  });

  it("blocks deletion when customers are still assigned", async () => {
    vi.mocked(customerGroupRepository.hasCustomers).mockResolvedValue(true);

    await expect(customerGroupService.remove(1n, 5n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(customerGroupRepository.hardDelete).not.toHaveBeenCalled();
  });

  it("blocks deletion when a price list still references the group (would otherwise cascade)", async () => {
    vi.mocked(customerGroupRepository.hasPriceLists).mockResolvedValue(true);

    await expect(customerGroupService.remove(1n, 5n)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(customerGroupRepository.hardDelete).not.toHaveBeenCalled();
  });
});
