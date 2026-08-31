"use client";

import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";

// Live-computed only — no persisted/dismissible notification (there is no
// notification-center UI anywhere in the app today, see
// modules/notification's unused backend routes). Recomputed on every
// /auth/me fetch (5-minute staleTime in auth-context.tsx), so it always
// reflects the current subscription state with no dedupe logic needed.
const RENEWAL_WARNING_THRESHOLD_DAYS = 14;

export function RenewalBanner() {
  const { user, can } = useAuth();
  const days = user?.tenant.daysUntilRenewal;

  if (!can("TENANT.UPDATE_SETTINGS") || days === undefined || days === null || days > RENEWAL_WARNING_THRESHOLD_DAYS) {
    return null;
  }

  const expired = days < 0;

  return (
    <div
      className={
        expired
          ? "flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive"
          : "flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
      }
    >
      <AlertTriangle className="size-4 shrink-0" />
      {expired ? (
        <span>
          Your plan expired {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} ago — renew to avoid service
          interruption.
        </span>
      ) : (
        <span>
          Your plan renews in {days} day{days === 1 ? "" : "s"}.
        </span>
      )}
    </div>
  );
}
