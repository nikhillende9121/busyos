import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/customer.repository", () => ({
  customerRepository: {
    findByIdForTenant: vi.fn(),
    findManyByTenant: vi.fn(),
    countByTenant: vi.fn(),
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

describe("customerService.list — pagination & date filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(customerRepository.findManyByTenant).mockResolvedValue([]);
    vi.mocked(customerRepository.countByTenant).mockResolvedValue(45);
  });

  it("computes skip from page and pageSize, and returns pagination built from the count", async () => {
    const result = await customerService.list({ tenantId: 1n, page: 3, pageSize: 20 });

    expect(customerRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ skip: 40, take: 20 }),
    );
    expect(result.pagination).toEqual({ page: 3, pageSize: 20, total: 45, totalPages: 3 });
  });

  it("passes dateFrom/dateTo through to the repository", async () => {
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const dateTo = new Date("2026-01-31T00:00:00.000Z");

    await customerService.list({ tenantId: 1n, page: 1, pageSize: 20, dateFrom, dateTo });

    expect(customerRepository.findManyByTenant).toHaveBeenCalledWith(1n, expect.objectContaining({ dateFrom, dateTo }));
    expect(customerRepository.countByTenant).toHaveBeenCalledWith(1n, expect.objectContaining({ dateFrom, dateTo }));
  });
});

describe("customerService.exportList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches every matching row with no skip/take", async () => {
    vi.mocked(customerRepository.findManyByTenant).mockResolvedValue([]);
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");

    await customerService.exportList({ tenantId: 1n, dateFrom });

    const callArgs = vi.mocked(customerRepository.findManyByTenant).mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ dateFrom });
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
    expect(customerRepository.countByTenant).not.toHaveBeenCalled();
  });
});
