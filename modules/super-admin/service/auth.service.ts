import { superAdminAuthRepository } from "../repository/auth.repository";
import { verifyPassword } from "@/modules/auth/utils/password.util";
import { signSuperAdminToken, signSuperAdminRefreshToken, verifySuperAdminToken } from "@/shared/auth/jwt";
import { AppError } from "@/shared/errors/app-error";
import type { SuperAdminLoginDto, SuperAdminRefreshDto } from "../dto/auth.dto";
import type { SuperAdminTokenPair } from "../types/auth.types";

// Same "one generic error, never reveal which part failed" discipline as
// modules/auth/service/auth.service.ts's tenant login.
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

export const superAdminAuthService = {
  async login(input: SuperAdminLoginDto): Promise<SuperAdminTokenPair> {
    const superAdmin = await superAdminAuthRepository.findByEmail(input.email);
    if (!superAdmin || superAdmin.status !== "ACTIVE") {
      throw new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await verifyPassword(input.password, superAdmin.password);
    if (!passwordMatches) {
      throw new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE);
    }

    const claims = { sub: superAdmin.id.toString() };
    return {
      accessToken: signSuperAdminToken(claims),
      refreshToken: signSuperAdminRefreshToken(claims),
    };
  },

  // Re-checks current state from the database rather than trusting the old
  // token's claims — same reasoning as modules/auth/service/auth.service.ts's
  // tenant refresh: a deactivated Super Admin must lose access immediately.
  async refresh(input: SuperAdminRefreshDto): Promise<SuperAdminTokenPair> {
    const claims = verifySuperAdminToken(input.refreshToken);
    const superAdminId = BigInt(claims.sub);

    const superAdmin = await superAdminAuthRepository.findById(superAdminId);
    if (!superAdmin || superAdmin.status !== "ACTIVE") {
      throw new AppError("UNAUTHENTICATED", "Session is no longer valid");
    }

    const newClaims = { sub: superAdmin.id.toString() };
    return {
      accessToken: signSuperAdminToken(newClaims),
      refreshToken: signSuperAdminRefreshToken(newClaims),
    };
  },
};
