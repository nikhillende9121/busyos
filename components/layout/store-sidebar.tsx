"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingCart,
  Undo2,
  Repeat,
  Truck,
  PackageX,
  Boxes,
  SlidersHorizontal,
  ArrowLeftRight,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STORE_NAV_ITEMS } from "@/lib/nav/store-sections";
import { useAuth } from "@/lib/auth/auth-context";

// A Material-style navigation rail, not a text-link sidebar — the terminal
// treatment this shell is going for (see Docs/STORE_APP_GUIDE.md) reads as
// "device chrome," so nav is icon-first with big tap targets rather than a
// dense list of labels, closer to what the Android Store Manager app uses.
const ICON_BY_HREF: Record<string, typeof ShoppingCart> = {
  "/store/sales": ShoppingCart,
  "/store/sale-returns": Undo2,
  "/store/sale-exchanges": Repeat,
  "/store/purchases": Truck,
  "/store/purchase-returns": PackageX,
  "/store/inventory": Boxes,
  "/store/adjustments": SlidersHorizontal,
  "/store/stock-transfers": ArrowLeftRight,
};

export function StoreSidebar() {
  const pathname = usePathname();
  const { can, hasFeature, isLoading, user } = useAuth();

  const visibleItems = isLoading
    ? STORE_NAV_ITEMS
    : STORE_NAV_ITEMS.filter((item) => can(item.permission) && (!item.feature || hasFeature(item.feature)));

  return (
    <aside className="hidden w-20 shrink-0 flex-col items-center bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 w-full items-center justify-center border-b border-sidebar-border">
        {user?.tenantLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
          <img src={user.tenantLogoUrl} alt="" className="h-8 w-8 rounded object-contain" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary font-heading text-sm font-bold text-sidebar-primary-foreground">
            B
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-3">
        {visibleItems.map((item) => {
          const Icon = ICON_BY_HREF[item.href] ?? ShoppingCart;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-center transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="text-[10.5px] leading-tight font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <Link
        href="/dashboard"
        className="flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-center text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LayoutDashboard className="size-5" />
        <span className="text-[10.5px] leading-tight font-medium">Dashboard</span>
      </Link>
      <div className="h-3" />
    </aside>
  );
}
