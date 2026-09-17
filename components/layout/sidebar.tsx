"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { GiShoppingBag } from "react-icons/gi";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/lib/nav/sections";
import { useAuth } from "@/lib/auth/auth-context";

export function Sidebar() {
  const pathname = usePathname();
  const { can, hasFeature, isLoading, user } = useAuth();

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
      <div className="flex h-14 shrink-0 items-center justify-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-heading font-semibold">
          {user?.tenantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
            <img src={user.tenantLogoUrl} alt="" className="h-8 max-w-36 object-contain" />
          ) : (
            <>
              <GiShoppingBag className="size-5 text-primary" />
              RetailX
            </>
          )}
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = isLoading
            ? section.items
            : section.items.filter(
                (item) => can(item.permission) && (!item.feature || hasFeature(item.feature)),
              );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <p className="mb-1.5 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm leading-tight transition-colors hover:bg-accent hover:text-accent-foreground",
                      pathname === item.href
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-foreground/80",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      {user?.warehouseId && (
        <div className="shrink-0 border-t p-4">
          <Link
            href="/store"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftRight className="size-3.5" /> Switch to Store view
          </Link>
        </div>
      )}
    </aside>
  );
}
