"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { STORE_NAV_ITEMS } from "@/lib/nav/store-sections";
import { useAuth } from "@/lib/auth/auth-context";

// Parallel to components/layout/sidebar.tsx, but flat (no section
// grouping — only ~7 items) and always identifies which single store
// the caller is scoped to, since that's the one thing every page here
// takes for granted instead of asking. See Docs/STORE_APP_GUIDE.md.
export function StoreSidebar() {
  const pathname = usePathname();
  const { can, isLoading, user } = useAuth();

  const visibleItems = isLoading ? STORE_NAV_ITEMS : STORE_NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
      <div className="flex flex-col items-center justify-center gap-1 border-b px-4 py-3 text-center">
        <Link href="/store" className="flex items-center gap-2 font-heading font-semibold">
          {user?.tenantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
            <img src={user.tenantLogoUrl} alt="" className="h-8 max-w-36 object-contain" />
          ) : (
            "Busyos"
          )}
        </Link>
        {user?.warehouseName && <p className="text-xs text-muted-foreground">{user.warehouseName}</p>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
              pathname === item.href || pathname.startsWith(`${item.href}/`)
                ? "bg-accent text-accent-foreground font-medium"
                : "text-foreground/80",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t p-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftRight className="size-3.5" /> Full dashboard
        </Link>
      </div>
    </aside>
  );
}
