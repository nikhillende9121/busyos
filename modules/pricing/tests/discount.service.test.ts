import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../repository/discount.repository", () => ({
  discountRepository: {
    findManyByTenant: vi.fn(),
    countByTenant: vi.fn(),
  },
}));

import { discountRepository } from "../repository/discount.repository";
import { discountService } from "../service/discount.service";

describe("discountService.list — pagination & date filter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(discountRepository.findManyByTenant).mockResolvedValue([]);
    vi.mocked(discountRepository.countByTenant).mockResolvedValue(45);
  });

  it("computes skip from page and pageSize, and returns pagination built from the count", async () => {
    const result = await discountService.list({ tenantId: 1n, page: 3, pageSize: 20 });

    expect(discountRepository.findManyByTenant).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ skip: 40, take: 20 }),
    );
    expect(result.pagination).toEqual({ page: 3, pageSize: 20, total: 45, totalPages: 3 });
  });

  it("passes dateFrom/dateTo through to the repository", async () => {
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");
    const dateTo = new Date("2026-01-31T00:00:00.000Z");

    await discountService.list({ tenantId: 1n, page: 1, pageSize: 20, dateFrom, dateTo });

    expect(discountRepository.findManyByTenant).toHaveBeenCalledWith(1n, expect.objectContaining({ dateFrom, dateTo }));
    expect(discountRepository.countByTenant).toHaveBeenCalledWith(1n, expect.objectContaining({ dateFrom, dateTo }));
  });
});

describe("discountService.exportList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches every matching row with no skip/take", async () => {
    vi.mocked(discountRepository.findManyByTenant).mockResolvedValue([]);
    const dateFrom = new Date("2026-01-01T00:00:00.000Z");

    await discountService.exportList({ tenantId: 1n, dateFrom });

    const callArgs = vi.mocked(discountRepository.findManyByTenant).mock.calls[0][1] as Record<string, unknown>;
    expect(callArgs).toMatchObject({ dateFrom });
    expect(callArgs.skip).toBeUndefined();
    expect(callArgs.take).toBeUndefined();
    expect(discountRepository.countByTenant).not.toHaveBeenCalled();
  });
});
