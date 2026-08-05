import jwt from "jsonwebtoken";
import { AppError } from "@/shared/errors/app-error";

// Cross-cutting JWT sign/verify — used by modules/auth (issuing tokens) and,
// later, by the request-pipeline auth check every protected route runs
// through (see Docs/ARCHITECTURE.md -> Request Pipeline). Not itself the
// `auth` business module — this is the reusable security primitive it's
// built on, the same reason it lives in shared/, not modules/auth/.
//
// Payload fields are strings, not bigint: JWTs are JSON, and Prisma's BigInt
// ids don't survive JSON.stringify. Callers convert bigint <-> string at the
// boundary (see modules/auth/service/auth.service.ts).
export type JwtClaims = {
  sub: string; // userId
  tenantId: string;
  roleId: string;
};

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError("INTERNAL_ERROR", "JWT_SECRET is not configured");
  }
  return secret;
}

export function signAccessToken(claims: JwtClaims): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "15m") as jwt.SignOptions["expiresIn"];
  return jwt.sign(claims, requireSecret(), { expiresIn });
}

export function signRefreshToken(claims: JwtClaims): string {
  const expiresIn = (process.env.JWT_REFRESH_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign(claims, requireSecret(), { expiresIn });
}

export function verifyToken(token: string): JwtClaims {
  try {
    return jwt.verify(token, requireSecret()) as JwtClaims;
  } catch {
    throw new AppError("UNAUTHENTICATED", "Invalid or expired token");
  }
}

// A platform-level Super Admin isn't tenant-scoped at all (see
// prisma/schema.prisma's SuperAdmin model) — a distinct, additive claims
// shape and pair of sign/verify functions, kept separate from JwtClaims/
// signAccessToken/verifyToken above rather than making tenantId/roleId
// optional on the existing ones (which every other route/service assumes
// are always present). Both use the same JWT_SECRET, so `scope` is what
// tells the two token kinds apart — verifySuperAdminToken rejects a
// perfectly valid tenant-user token that's simply missing it.
export type SuperAdminJwtClaims = {
  sub: string; // SuperAdmin id
  scope: "SUPER_ADMIN";
};

export function signSuperAdminToken(claims: Omit<SuperAdminJwtClaims, "scope">): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "15m") as jwt.SignOptions["expiresIn"];
  return jwt.sign({ ...claims, scope: "SUPER_ADMIN" }, requireSecret(), { expiresIn });
}

export function signSuperAdminRefreshToken(claims: Omit<SuperAdminJwtClaims, "scope">): string {
  const expiresIn = (process.env.JWT_REFRESH_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"];
  return jwt.sign({ ...claims, scope: "SUPER_ADMIN" }, requireSecret(), { expiresIn });
}

export function verifySuperAdminToken(token: string): SuperAdminJwtClaims {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, requireSecret());
  } catch {
    throw new AppError("UNAUTHENTICATED", "Invalid or expired token");
  }
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    (decoded as { scope?: string }).scope !== "SUPER_ADMIN"
  ) {
    throw new AppError("UNAUTHENTICATED", "Invalid or expired token");
  }
  return decoded as SuperAdminJwtClaims;
}
