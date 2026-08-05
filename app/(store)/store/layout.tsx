import { StoreSidebar } from "@/components/layout/store-sidebar";
import { StoreTopbar } from "@/components/layout/store-topbar";

// Mirrors app/(dashboard)/layout.tsx's structure, but with a terminal-style
// shell: an icon nav rail instead of a text sidebar, and StoreTopbar (store
// name + live clock) instead of the dashboard's generic Header — see
// Docs/STORE_APP_GUIDE.md and components/layout/store-sidebar.tsx's own
// comment for why. proxy.ts's matcher already guards this route group the
// same way it guards /(dashboard)/** — no changes needed there.
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 bg-muted/40">
      <StoreSidebar />
      <div className="flex flex-1 flex-col">
        <StoreTopbar />
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}
