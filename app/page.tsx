import Link from "next/link";
import { Boxes, ShoppingCart, Warehouse, Users, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const FEATURES = [
  {
    icon: Warehouse,
    title: "Multi-warehouse inventory",
    description: "One live stock ledger across every store and warehouse — never a spreadsheet reconciliation again.",
  },
  {
    icon: ShoppingCart,
    title: "Purchasing to selling, in one flow",
    description: "Products, purchase orders, and point-of-sale connected end to end — confirm a purchase and stock updates instantly.",
  },
  {
    icon: Boxes,
    title: "Pricing & promotions built in",
    description: "Per-store pricing, customer-tier discounts, and coupons — applied automatically, tracked on every sale.",
  },
  {
    icon: Users,
    title: "Role-based access",
    description: "Cashier, Store Manager, Admin, or a custom role — everyone sees exactly what their job needs, nothing more.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "₹1,499",
    period: "/month",
    description: "For a single store finding its footing.",
    features: ["1 warehouse", "Up to 3 users", "Sales & purchasing", "Basic reporting"],
  },
  {
    name: "Growth",
    price: "₹3,999",
    period: "/month",
    description: "For a business running more than one store.",
    features: ["Up to 5 warehouses", "Up to 15 users", "Multi-store inventory", "Pricing & promotions", "Priority support"],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For chains and distributors at scale.",
    features: ["Unlimited warehouses", "Unlimited users", "Dedicated onboarding", "Custom reporting"],
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-heading text-lg font-semibold tracking-tight">Busyos</span>
          <Button render={<Link href="/login">Sign in</Link>} />
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute -right-32 top-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
            <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
              Inventory, purchasing & sales — one system, every store.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Busyos replaces disconnected billing, spreadsheets, and guesswork with one platform where stock,
              pricing, and sales always agree — from your first store to your fiftieth.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button size="lg" render={<Link href="/login">Sign in to your workspace</Link>} />
              <Button size="lg" variant="outline" render={<Link href="#plans">See plans</Link>} />
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="space-y-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <feature.icon className="size-4.5" />
                  </div>
                  <h3 className="font-heading text-sm font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="plans" className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="font-heading text-3xl font-semibold tracking-tight">Plans that grow with you</h2>
              <p className="mt-3 text-muted-foreground">
                Start with one store, scale to a chain — without switching systems.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {PLANS.map((plan) => (
                <Card key={plan.name} className={plan.highlighted ? "border-primary shadow-md" : undefined}>
                  <CardHeader>
                    <p className="font-heading text-lg font-semibold">{plan.name}</p>
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                    <p className="pt-2">
                      <span className="font-heading text-3xl font-semibold">{plan.price}</span>
                      <span className="text-sm text-muted-foreground">{plan.period}</span>
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-2">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Busyos. Multi-tenant inventory, purchase & sales platform.
        </div>
      </footer>
    </div>
  );
}
