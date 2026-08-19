import Link from "next/link";
import {
  Boxes,
  ShoppingCart,
  Warehouse,
  Users,
  Check,
  Zap,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  Percent,
  Receipt,
  RotateCcw,
  Truck,
  Building2,
  FileCheck2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeroPreview } from "@/components/landing/hero-preview";
import { PricingSection } from "@/components/landing/pricing-section";
import { RoleWorkflows } from "@/components/landing/role-workflows";
import { FaqSection } from "@/components/landing/faq-section";

const CORE_MODULES = [
  {
    icon: Warehouse,
    title: "Multi-Store & Warehouse Stock",
    badge: "Live Ledger",
    description:
      "One real-time stock balance across every physical branch. Inter-store stock transfers with ship & receive tracking, low-stock threshold alerts, and instant shrinkage audit adjustments.",
  },
  {
    icon: Truck,
    title: "Purchasing & Supplier POs",
    badge: "PO to Stock",
    description:
      "Connected supply chain flow. Issue purchase orders, record partial shipment receipts, generate supplier bills, and execute purchase returns without manual data re-entry.",
  },
  {
    icon: ShoppingCart,
    title: "Counter POS & Shift Tracking",
    badge: "Tap-First",
    description:
      "Store-floor counter checkout with fast barcode scanning, cash-drawer shift session management (opening float vs closing count), and customer group lookup.",
  },
  {
    icon: Percent,
    title: "Pricing, Discounts & Coupons",
    badge: "Central Control",
    description:
      "Set per-store price lists, customer tier discounts, and rule-based coupons. Historical pricing records preserve exact charges even after promotions change.",
  },
  {
    icon: RotateCcw,
    title: "Returns & Spot Exchanges",
    badge: "Discount-Aware",
    description:
      "Process discount-aware sale returns and perform instant item-for-item exchanges at the till with automated price difference settlement on the spot.",
  },
  {
    icon: Receipt,
    title: "GST Tax Rates & Compliance",
    badge: "Tax Ready",
    description:
      "Configurable CGST, SGST, IGST, and CESS components per product or tenant-wide, plus flat/percentage extra fees (packing, freight) and period GST tax liability reports.",
  },
];

const PROBLEM_VS_SOLUTION = [
  {
    problem: "Stock counts on paper or Excel never match physical shelf stock across locations.",
    solution: "One real-time stock ledger — every sale, purchase, or transfer updates stock instantly everywhere.",
  },
  {
    problem: "Billing, purchase orders, and inventory live in 3 separate disconnected tools.",
    solution: "Purchasing to POS in one connected flow — PO received stock is instantly available for sale.",
  },
  {
    problem: "Cashiers override prices or apply unapproved discounts without control.",
    solution: "System-enforced RBAC — price lists and discount rules are locked by role, not by trust.",
  },
  {
    problem: "Finance and business owners wait days after month-end to see true profitability.",
    solution: "Live revenue, stock valuation, gross margin, and GST tax liability dashboards 24/7.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans antialiased">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Boxes className="size-5" />
            </div>
            <div>
              <span className="font-heading text-lg font-bold tracking-tight text-foreground">RetailX</span>
              <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                IMPS One
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-xs font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              What We Provide
            </a>
            <a href="#solutions" className="transition-colors hover:text-foreground">
              How We Help
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing Plans
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Button size="sm" render={<Link href="/login">Sign in to Workspace</Link>} />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background pb-20 pt-16 sm:pb-28 sm:pt-24">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -right-20 top-20 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-5xl px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-semibold text-primary">
              <Zap className="size-3.5" />
              <span>Built for Multi-Store Retail Chains & Distributors</span>
            </div>

            <h1 className="mt-6 font-heading text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl sm:leading-[1.15]">
              Inventory, Purchasing & Sales — <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-primary via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                One System, Every Store.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              RetailX (IMPS One) replaces disconnected billing apps, spreadsheets, and guesswork with one unified platform
              where live stock, per-store pricing, purchasing, and point-of-sale always agree.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" className="gap-2 px-6" render={<Link href="/login">Sign in to Workspace</Link>} />
              <Button size="lg" variant="outline" render={<Link href="#pricing">See Pricing & Plans</Link>} />
            </div>

            {/* Quick feature highlights beneath CTA */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Check className="size-4 text-emerald-500" /> Multi-Warehouse Ready
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="size-4 text-emerald-500" /> POS Shift Reconciliations
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="size-4 text-emerald-500" /> GST Tax Compliance
              </span>
            </div>

            {/* Interactive Hero Preview Component */}
            <div className="mt-14">
              <HeroPreview />
            </div>
          </div>
        </section>

        {/* PROBLEM VS SOLUTION SECTION */}
        <section className="border-t bg-muted/40 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="outline" className="mb-3 border-destructive/30 bg-destructive/5 text-destructive">
                Why Traditional Retail Software Fails
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Built for multi-location from day one, not stretched to fit
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Most inventory systems were built for a single till and stretched. RetailX is built for scale.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {PROBLEM_VS_SOLUTION.map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="space-y-4">
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-destructive">The Friction Point</p>
                      <p className="mt-1 text-xs font-medium text-foreground">{item.problem}</p>
                    </div>

                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        The RetailX Solution
                      </p>
                      <p className="mt-1 text-xs font-medium text-foreground">{item.solution}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CORE MODULES / WHAT WE COVER */}
        <section id="features" className="border-t bg-background py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 text-primary">
                Complete Business Coverage
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                What RetailX Actually Provides & Covers
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Every business area owned by dedicated modules operating in harmony.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {CORE_MODULES.map((mod) => (
                <Card key={mod.title} className="group relative flex flex-col justify-between transition-all hover:border-primary/50 hover:shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                        <mod.icon className="size-5" />
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-bold">
                        {mod.badge}
                      </Badge>
                    </div>
                    <h3 className="pt-4 font-heading text-base font-bold text-foreground">{mod.title}</h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs leading-relaxed text-muted-foreground">{mod.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* HOW WE HELP USERS (ROLE-BASED WORKFLOWS) */}
        <RoleWorkflows />

        {/* QUANTITATIVE ROI & BUSINESS METRICS */}
        <section className="border-t bg-gradient-to-br from-primary/5 via-background to-indigo-500/5 py-16">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-center">
              <div className="space-y-1">
                <p className="font-heading text-4xl font-extrabold tracking-tight text-primary">100%</p>
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">Live Stock Accuracy</p>
                <p className="text-xs text-muted-foreground">Zero variance between system & shelf count</p>
              </div>

              <div className="space-y-1">
                <p className="font-heading text-4xl font-extrabold tracking-tight text-indigo-600 dark:text-indigo-400">&lt; 5 Mins</p>
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">New Store Onboarding</p>
                <p className="text-xs text-muted-foreground">Launch new branches instantly</p>
              </div>

              <div className="space-y-1">
                <p className="font-heading text-4xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">0 Hours</p>
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">Month-End Audit Lag</p>
                <p className="text-xs text-muted-foreground">Real-time ledger updates automatically</p>
              </div>

              <div className="space-y-1">
                <p className="font-heading text-4xl font-extrabold tracking-tight text-purple-600 dark:text-purple-400">100%</p>
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">Immutable Audit Trail</p>
                <p className="text-xs text-muted-foreground">Every price edit & stock move logged</p>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING & FEATURE MATRIX SECTION */}
        <PricingSection loginHref="/login" />

        {/* SECURITY & ARCHITECTURE TRUST */}
        <section className="border-t bg-background py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="outline" className="mb-3 border-emerald-500/30 bg-emerald-500/5 text-emerald-600">
                Enterprise Platform Security
              </Badge>
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Your store data, walled off & protected
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Engineered with multi-tenant data isolation, strict role permissions, and immutable audit logs.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Lock className="size-5" />
                </div>
                <h3 className="mt-4 font-heading text-base font-bold text-foreground">Strict Tenant Isolation</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Every business on RetailX is walled off. Your stock, prices, sales records, and customer lists are completely private.
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <ShieldCheck className="size-5" />
                </div>
                <h3 className="mt-4 font-heading text-base font-bold text-foreground">Enforced Role Permissions</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Cashiers, Store Managers, Purchase Officers, and Admins operate under system-enforced permission scopes.
                </p>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <FileCheck2 className="size-5" />
                </div>
                <h3 className="mt-4 font-heading text-base font-bold text-foreground">Permanent Audit History</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Every purchase, sale, price adjustment, and transfer is recorded permanently. Nothing is silently overwritten.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ ACCORDION SECTION */}
        <FaqSection />

        {/* FINAL CTA BANNER */}
        <section className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-5xl px-6">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary via-indigo-600 to-purple-600 px-6 py-14 text-center shadow-2xl sm:px-12 sm:py-20">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-24 -left-24 size-72 rounded-full bg-white/10 blur-2xl" />
                <div className="absolute -bottom-24 -right-24 size-72 rounded-full bg-black/10 blur-2xl" />
              </div>

              <div className="relative mx-auto max-w-2xl space-y-6">
                <h2 className="font-heading text-3xl font-extrabold text-white sm:text-5xl">
                  Ready to run all your stores on one live system?
                </h2>
                <p className="text-base text-white/80">
                  Join growing retail chains and distributors using RetailX to unify purchasing, stock, and point-of-sale.
                </p>
                <div className="pt-2">
                  <Button
                    size="lg"
                    className="bg-white text-primary hover:bg-white/90 shadow-xl gap-2 font-bold px-8"
                    render={<Link href="/login">Launch Workspace Now</Link>}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Boxes className="size-4 text-primary" />
            <span className="font-heading font-semibold text-foreground">RetailX / IMPS One</span>
            <span>— Multi-tenant inventory, purchase & sales platform.</span>
          </div>
          <div>
            © {new Date().getFullYear()} RetailX. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
