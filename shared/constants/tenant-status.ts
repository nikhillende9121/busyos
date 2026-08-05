// Shared between modules/auth (login/refresh gate) and shared/middleware
// (every subsequent request's Subscription Validation step) — see
// Docs/ARCHITECTURE.md -> Request Pipeline. Kept in one place so the
// definition of "operable tenant" can't drift between the two call sites.
export const ACTIVE_TENANT_STATUSES = new Set(["ACTIVE", "TRIAL"]);
