import { StoreSidebar } from "@/components/layout/store-sidebar";
import { Header } from "@/components/layout/header";

// Mirrors app/(dashboard)/layout.tsx exactly, swapping in the simplified
// store sidebar — Header is reused as-is (generic account menu, no
// dashboard-specific coupling). proxy.ts's matcher already guards this
// route group the same way it guards /(dashboard)/** — no changes
// needed there.
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <StoreSidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
