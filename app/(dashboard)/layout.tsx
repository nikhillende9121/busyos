import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { RenewalBanner } from "@/components/layout/renewal-banner";

// Everything under this route group is a protected dashboard page.
// proxy.ts already redirects a signed-out visitor to /login before this
// ever renders — this layout just supplies the shell (sidebar + header)
// around whichever module page is active.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <RenewalBanner />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
