"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/lib/nav/sections";
import { useAuth } from "@/lib/auth/auth-context";

export function Sidebar() {
  const pathname = usePathname();
  const { can, isLoading, user } = useAuth();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
      <div className="flex h-14 items-center justify-center border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-heading font-semibold">
          {user?.tenantLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
            <img src={user.tenantLogoUrl} alt="" className="h-8 max-w-36 object-contain" />
          ) : (
            "Busyos"
          )}
        </Link>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = isLoading ? section.items : section.items.filter((item) => can(item.permission));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} className="space-y-1">
              <p className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {section.title}
              </p>
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                    pathname === item.href ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      {user?.warehouseId && (
        <div className="border-t p-4">
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
