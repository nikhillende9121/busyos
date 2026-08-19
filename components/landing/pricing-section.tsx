"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PricingSectionProps {
  loginHref?: string;
}

export function PricingSection({ loginHref = "/login" }: PricingSectionProps) {
  const [isAnnual, setIsAnnual] = useState<boolean>(true);

  const PLANS = [
    {
      id: "starter",
      name: "Starter",
      description: "Everything required to run a single store location efficiently.",
      annualPrice: "₹14,990",
      annualPeriod: "/ year",
      monthlyPrice: "₹1,499",
      monthlyPeriod: "/ month",
      effectiveMonthly: "₹1,249 / mo effectively",
      features: [
        "1 Warehouse / Store Location",
        "Up to 3 Staff User Accounts",
        "Full Product Catalog & Categories",
        "Suppliers & Purchase Orders",
        "Store Checkout POS & Sales Grid",
        "Tax Rates (CGST/SGST/IGST) & GST Report",
        "Dashboard Business Insights",
        "Email Support",
      ],
      ctaText: "Start Starter Plan",
      highlighted: false,
    },
    {
      id: "growth",
      name: "Growth",
      description: "Designed for multi-store retail operations and expanding chains.",
      annualPrice: "₹24,999",
      annualPeriod: "/ year",
      monthlyPrice: "₹3,999",
      monthlyPeriod: "/ month",
      effectiveMonthly: "₹2,083 / mo effectively",
      features: [
        "Up to 5 Warehouses / Stores",
        "Up to 15 Staff User Accounts",
        "Multi-Store Stock Transfers (Ship & Receive)",
        "Price Lists & Tiered Discounts",
        "Rule-Based Coupons & Promotions",
        "Discount-Aware Returns & Exchanges",
        "Customer Directory & Customer Groups",
        "Priority Support & Guided Setup",
      ],
      ctaText: "Choose Growth Plan",
      highlighted: true,
      popularBadge: "Most Popular for Multi-Store",
    },
    {
      id: "enterprise",
      name: "Enterprise",
      description: "Uncapped scale for large retail chains, franchises & distributors.",
      annualPrice: "Custom",
      annualPeriod: "",
      monthlyPrice: "Custom",
      monthlyPeriod: "",
      effectiveMonthly: "Tailored to your business size",
      features: [
        "Unlimited Warehouses & Locations",
        "Unlimited Staff & Cashier Accounts",
        "Custom Business Reports & Analytics",
        "Dedicated Account Manager",
        "Custom Workflow Integrations",
        "Direct Onboarding & Staff Training",
        "24/7 Priority SLA Support",
      ],
      ctaText: "Contact Enterprise Sales",
      highlighted: false,
    },
  ];

  const MATRIX_FEATURES = [
    { name: "Max Warehouses / Stores", starter: "1", growth: "Up to 5", enterprise: "Unlimited" },
    { name: "Max Staff User Accounts", starter: "Up to 3", growth: "Up to 15", enterprise: "Unlimited" },
    { name: "Product & Unit Management", starter: true, growth: true, enterprise: true },
    { name: "Suppliers & Purchase Orders", starter: true, growth: true, enterprise: true },
    { name: "Counter POS & Sales Grid", starter: true, growth: true, enterprise: true },
    { name: "GST & Tax Calculations", starter: true, growth: true, enterprise: true },
    { name: "Purchase Returns", starter: false, growth: true, enterprise: true },
    { name: "Sale Returns & Exchanges", starter: false, growth: true, enterprise: true },
    { name: "Multi-Store Stock Transfers", starter: false, growth: true, enterprise: true },
    { name: "Price Lists & Customer Groups", starter: false, growth: true, enterprise: true },
    { name: "Discount & Coupon Engine", starter: false, growth: true, enterprise: true },
    { name: "Custom Reporting & SLA", starter: false, growth: false, enterprise: true },
  ];

  return (
    <section id="pricing" className="border-t bg-muted/20 py-20">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/5 text-primary">
            Simple & Transparent Pricing
          </Badge>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Plans built to scale with your retail growth
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Start with your first shop today, expand to 50 stores seamlessly without ever changing software.
          </p>

          {/* Billing Switch Toggle */}
          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-border/80 bg-background p-1.5 shadow-sm">
            <button
              onClick={() => setIsAnnual(true)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                isAnnual
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual Billing
            </button>
            <button
              onClick={() => setIsAnnual(false)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                !isAnnual
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly Billing
            </button>
            {isAnnual && (
              <span className="mr-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                Save ~20%
              </span>
            )}
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const priceDisplay = isAnnual ? plan.annualPrice : plan.monthlyPrice;
            const periodDisplay = isAnnual ? plan.annualPeriod : plan.monthlyPeriod;

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col justify-between transition-all duration-200 ${
                  plan.highlighted
                    ? "border-2 border-primary shadow-xl ring-2 ring-primary/20"
                    : "border border-border/80 shadow-sm hover:border-border hover:shadow-md"
                }`}
              >
                {plan.popularBadge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className="gap-1 bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground shadow-md">
                      <Sparkles className="size-3" />
                      {plan.popularBadge}
                    </Badge>
                  </div>
                )}

                <CardHeader className="pt-7">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-xl font-bold text-foreground">{plan.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>

                  <div className="mt-5 border-b border-border/50 pb-5">
                    <div className="flex items-baseline gap-1">
                      <span className="font-heading text-4xl font-extrabold tracking-tight text-foreground">
                        {priceDisplay}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground">{periodDisplay}</span>
                    </div>
                    {isAnnual && plan.id !== "enterprise" && (
                      <p className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        {plan.effectiveMonthly}
                      </p>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-4 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Included Capabilities:</p>
                  <ul className="space-y-2.5">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-xs text-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <div className="p-6 pt-0">
                  <Button
                    className="w-full gap-2"
                    variant={plan.highlighted ? "default" : "outline"}
                    size="lg"
                    render={<Link href={loginHref}>{plan.ctaText}</Link>}
                  />
                </div>
              </Card>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="mt-20 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-sm">
          <div className="border-b border-border/60 bg-muted/40 px-6 py-4">
            <h3 className="font-heading text-lg font-bold text-foreground">Full Module & Feature Comparison</h3>
            <p className="text-xs text-muted-foreground">Compare exact business permissions and gated feature flags across plans</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20 text-muted-foreground">
                  <th className="px-6 py-3.5 font-semibold">Business Module</th>
                  <th className="px-6 py-3.5 text-center font-semibold">Starter</th>
                  <th className="px-6 py-3.5 text-center font-semibold text-primary">Growth</th>
                  <th className="px-6 py-3.5 text-center font-semibold">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {MATRIX_FEATURES.map((row) => (
                  <tr key={row.name} className="hover:bg-muted/10">
                    <td className="px-6 py-3.5 font-medium text-foreground">{row.name}</td>
                    
                    {/* Starter value */}
                    <td className="px-6 py-3.5 text-center">
                      {typeof row.starter === "boolean" ? (
                        row.starter ? (
                          <Check className="mx-auto size-4 text-emerald-500" />
                        ) : (
                          <X className="mx-auto size-4 text-muted-foreground/40" />
                        )
                      ) : (
                        <span className="font-medium text-foreground">{row.starter}</span>
                      )}
                    </td>

                    {/* Growth value */}
                    <td className="px-6 py-3.5 text-center bg-primary/5">
                      {typeof row.growth === "boolean" ? (
                        row.growth ? (
                          <Check className="mx-auto size-4 text-primary" />
                        ) : (
                          <X className="mx-auto size-4 text-muted-foreground/40" />
                        )
                      ) : (
                        <span className="font-semibold text-primary">{row.growth}</span>
                      )}
                    </td>

                    {/* Enterprise value */}
                    <td className="px-6 py-3.5 text-center">
                      {typeof row.enterprise === "boolean" ? (
                        row.enterprise ? (
                          <Check className="mx-auto size-4 text-emerald-500" />
                        ) : (
                          <X className="mx-auto size-4 text-muted-foreground/40" />
                        )
                      ) : (
                        <span className="font-medium text-foreground">{row.enterprise}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
