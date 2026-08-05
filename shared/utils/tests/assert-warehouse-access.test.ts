import { describe, it, expect } from "vitest";
import { assertWarehouseAccess, assertWarehouseAccessAny } from "../assert-warehouse-access";
import type { AuthContext } from "@/shared/middleware/with-api-auth";

function auth(warehouseId: bigint | null): AuthContext {
  return { userId: 1n, tenantId: 1n, roleId: 1n, warehouseId };
}

describe("assertWarehouseAccess", () => {
  it("allows an unrestricted user (warehouseId null) at any warehouse", () => {
    expect(() => assertWarehouseAccess(auth(null), 99n)).not.toThrow();
  });

  it("allows a scoped user acting on their own warehouse", () => {
    expect(() => assertWarehouseAccess(auth(5n), 5n)).not.toThrow();
  });

  it("rejects a scoped user acting on a different warehouse", () => {
    expect(() => assertWarehouseAccess(auth(5n), 6n)).toThrow(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });
});

describe("assertWarehouseAccessAny", () => {
  it("allows a scoped user when either warehouse matches their own", () => {
    expect(() => assertWarehouseAccessAny(auth(5n), [5n, 6n])).not.toThrow();
    expect(() => assertWarehouseAccessAny(auth(6n), [5n, 6n])).not.toThrow();
  });

  it("rejects a scoped user when neither warehouse matches", () => {
    expect(() => assertWarehouseAccessAny(auth(7n), [5n, 6n])).toThrow(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });

  it("allows an unrestricted user regardless of the warehouse list", () => {
    expect(() => assertWarehouseAccessAny(auth(null), [5n, 6n])).not.toThrow();
  });
});
