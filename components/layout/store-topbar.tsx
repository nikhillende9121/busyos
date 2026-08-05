"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";

// Store-specific counterpart to components/layout/header.tsx — a terminal's
// top bar leads with WHERE you are (which store) and WHEN it is (a live
// clock, standard on a till/POS screen), not just an account menu tucked in
// a corner. The dashboard's generic Header is intentionally left untouched.
export function StoreTopbar() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // No initial synchronous setNow() here — the first tick renders after
    // 1s, avoiding a cascading render from setState-in-effect. An SSR'd
    // clock would mismatch the client's real time on hydration anyway.
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/session/logout", { method: "POST" });
    queryClient.clear();
    router.push("/login");
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Store className="size-4.5" />
        </div>
        <div className="leading-tight">
          <p className="font-heading text-sm font-semibold">{user?.warehouseName ?? "Store"}</p>
          <p className="text-xs text-muted-foreground">Point of sale</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {now && (
          <div className="hidden text-right sm:block">
            <p className="font-mono text-sm leading-tight font-medium tabular-nums">
              {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="text-xs leading-tight text-muted-foreground">
              {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="gap-2">
                {user?.name ?? "Account"}
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{user?.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user?.email}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user?.role.name}</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
