import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("../repository/auth.repository", () => ({
  superAdminAuthRepository: {
    findByEmail: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("@/shared/auth/jwt", () => ({
  signSuperAdminToken: vi.fn(() => "access-token"),
  signSuperAdminRefreshToken: vi.fn(() => "refresh-token"),
  verifySuperAdminToken: vi.fn(),
}));

import { superAdminAuthRepository } from "../repository/auth.repository";
import { verifySuperAdminToken } from "@/shared/auth/jwt";
import { superAdminAuthService } from "../service/auth.service";

const TEST_PASSWORD = "Password123!";
const TEST_PASSWORD_HASH = await bcrypt.hash(TEST_PASSWORD, 4);

function superAdminRow(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 1n, email: "root@platform.test", password: TEST_PASSWORD_HASH, status: "ACTIVE", ...overrides };
}

describe("superAdminAuthService.login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a token pair for valid credentials", async () => {
    vi.mocked(superAdminAuthRepository.findByEmail).mockResolvedValue(superAdminRow() as never);

    const result = await superAdminAuthService.login({ email: "root@platform.test", password: TEST_PASSWORD });

    expect(result).toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });
  });

  it("rejects an unknown email with the same generic error as a wrong password", async () => {
    vi.mocked(superAdminAuthRepository.findByEmail).mockResolvedValue(null);

    await expect(
      superAdminAuthService.login({ email: "missing@platform.test", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects an inactive super admin even with correct credentials", async () => {
    vi.mocked(superAdminAuthRepository.findByEmail).mockResolvedValue(
      superAdminRow({ status: "INACTIVE" }) as never,
    );

    await expect(
      superAdminAuthService.login({ email: "root@platform.test", password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects a wrong password", async () => {
    vi.mocked(superAdminAuthRepository.findByEmail).mockResolvedValue(superAdminRow() as never);

    await expect(
      superAdminAuthService.login({ email: "root@platform.test", password: "wrong-password" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

describe("superAdminAuthService.refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-validates current status rather than trusting the token alone", async () => {
    vi.mocked(verifySuperAdminToken).mockReturnValue({ sub: "1", scope: "SUPER_ADMIN" });
    vi.mocked(superAdminAuthRepository.findById).mockResolvedValue(superAdminRow() as never);

    const result = await superAdminAuthService.refresh({ refreshToken: "some-refresh-token" });

    expect(result).toEqual({ accessToken: "access-token", refreshToken: "refresh-token" });
  });

  it("rejects refresh for a super admin deactivated after the token was issued", async () => {
    vi.mocked(verifySuperAdminToken).mockReturnValue({ sub: "1", scope: "SUPER_ADMIN" });
    vi.mocked(superAdminAuthRepository.findById).mockResolvedValue(superAdminRow({ status: "INACTIVE" }) as never);

    await expect(superAdminAuthService.refresh({ refreshToken: "some-refresh-token" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
