"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
// Type-only import: erased at compile time, so this pulls in zero backend
// runtime code — just reuses the exact shape GET /api/v1/auth/me returns
// instead of redefining it here and risking drift.
import type { MeView } from "@/modules/auth/types/auth.types";

type AuthContextValue = {
  user: MeView | undefined;
  isLoading: boolean;
  // Backed by the caller's real permission list (shared/middleware/rbac-lookup.ts,
  // via GET /api/v1/auth/me) — used to hide nav items/buttons the user's
  // role doesn't hold. Not the enforcement boundary: withApiAuth still
  // checks every request server-side regardless of what this returns.
  can: (permissionCode: string) => boolean;
  // Same idea, but for the tenant's plan rather than the user's role — a
  // nav item whose backing route is gated by `feature: "SALE_RETURN"`
  // must check this too, or it stays visible/clickable for a tenant whose
  // plan doesn't include it, leading straight to a 403 FEATURE_NOT_ENABLED.
  hasFeature: (featureCode: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Mounted globally (app/providers.tsx), so it also wraps /super-admin/**
  // — an entirely separate identity (see shared/middleware/with-super-admin-auth.ts)
  // with no tenant session cookie at all. Fetching /auth/me there would
  // always 401 and, worse, bounce the visitor to the tenant /login page.
  // Same reasoning for "/" — the public landing page, which never has a
  // session by design and has no use for `user`/`can`/`hasFeature` anyway.
  const pathname = usePathname();
  const isPublicRoute = pathname === "/" || (pathname?.startsWith("/super-admin") ?? false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => apiClient.get<MeView>("/auth/me"),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !isPublicRoute,
  });

  const can = (permissionCode: string) => data?.permissions.includes(permissionCode) ?? false;
  const hasFeature = (featureCode: string) => data?.enabledFeatures.includes(featureCode) ?? false;

  return <AuthContext.Provider value={{ user: data, isLoading, can, hasFeature }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
