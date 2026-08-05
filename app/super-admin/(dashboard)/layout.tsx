"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { label: "Tenants", href: "/super-admin/tenants" },
  { label: "Plans", href: "/super-admin/plans" },
  { label: "Features", href: "/super-admin/features" },
];

// Deliberately separate from app/(dashboard)/layout.tsx — a Super Admin
// isn't tenant-scoped at all (see shared/middleware/with-super-admin-auth.ts),
// so there's no permission system to gate nav items against here, unlike
// the tenant dashboard's sidebar.
export default function SuperAdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/super-admin-session/logout", { method: "POST" });
    router.push("/super-admin/login");
  };

  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/20 md:flex md:flex-col">
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/super-admin/tenants" className="font-heading font-semibold">
            Super Admin
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {NAV_ITEMS.map((item) => (
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
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end border-b px-4">
          <Button variant="ghost" onClick={() => void handleLogout()}>
            Sign out
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
