"use client";

import { useState } from "react";
import {
  Briefcase,
  Store,
  ShoppingCart,
  Truck,
  CheckCircle,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Boxes,
  Receipt,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface RoleWorkflow {
  id: string;
  roleTitle: string;
  subtitle: string;
  icon: any;
  headline: string;
  description: string;
  highlights: string[];
  metricsBadge: string;
}

const ROLES: RoleWorkflow[] = [
  {
    id: "owner",
    roleTitle: "Owners & CFOs",
    subtitle: "Real-time visibility across all stores",
    icon: Briefcase,
    headline: "Zero guesswork, instant financial & stock clarity across your entire retail chain.",
    description:
      "Eliminate month-end reconciliation surprises. Track gross profit margins, real-time GST liabilities, and live stock values across every store location from a single dashboard.",
    highlights: [
      "Live multi-store revenue & margin dashboards",
      "GST-ready reports (CGST, SGST, IGST output vs input)",
      "System-enforced RBAC — cashiers cannot edit prices",
      "Complete immutable audit trail for every price change & transfer",
    ],
    metricsBadge: "100% Financial Accuracy",
  },
  {
    id: "manager",
    roleTitle: "Store Managers",
    subtitle: "Effortless shift & stock control",
    icon: Store,
    headline: "Keep shelves stocked, cash drawers balanced, and branch staff aligned.",
    description:
      "Initiate stock transfers to other branches with ship & receive tracking. Reconcile opening float vs closing cash counts at the end of every shift with zero manual ledger entries.",
    highlights: [
      "Inter-store stock transfers with ship/receive verification",
      "Counter cash drawer session tracking & float reconciliation",
      "Instant low-stock alerts & inventory shrinkage adjustments",
      "Per-store price lists and localized promotion rules",
    ],
    metricsBadge: "0 Unchecked Inventory Losses",
  },
  {
    id: "cashier",
    roleTitle: "Cashiers & POS Staff",
    subtitle: "Rapid, error-free counter checkout",
    icon: ShoppingCart,
    headline: "Speed up checkout lines with tap-first POS and automated discount calculations.",
    description:
      "Barcode scanner ready counter interface. Automatically apply customer-tier discounts, coupons, and tax rates in a single click, then issue instant printed or digital receipts.",
    highlights: [
      "Tap-first product grid + fast barcode scanning",
      "Automatic customer-tier discount and coupon redemption",
      "Seamless sale returns and instant item exchanges at till",
      "Thermal printer & USB cash drawer hardware support",
    ],
    metricsBadge: "< 10 Seconds per Transaction",
  },
  {
    id: "purchasing",
    roleTitle: "Purchase Officers",
    subtitle: "Connected PO to receiving workflow",
    icon: Truck,
    headline: "Never run out of high-velocity inventory or overpay suppliers again.",
    description:
      "Create purchase orders, track supplier lead times, and receive partial or full shipments directly into live warehouse stock with automatic purchase bill generation.",
    highlights: [
      "Supplier directory & purchase order lifecycle management",
      "Partial shipment receiving with instant stock balance updates",
      "Purchase return workflows for damaged or incorrect shipments",
      "Automatic reorder triggers based on live sales velocity",
    ],
    metricsBadge: "Automated Reorder Workflows",
  },
];

export function RoleWorkflows() {
  const [activeRoleId, setActiveRoleId] = useState<string>("owner");
  const currentRole = ROLES.find((r) => r.id === activeRoleId) || ROLES[0];
  const IconComponent = currentRole.icon;

  return (
    <section id="solutions" className="border-t bg-background py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <Badge variant="outline" className="mb-3 border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
            Tailored For Every Role
          </Badge>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            How RetailX empowers your entire workforce
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            From store-floor cashiers to executive directors — built to make everyone's job faster, simpler, and error-proof.
          </p>
        </div>

        {/* Role Selector Tabs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {ROLES.map((r) => {
            const isActive = r.id === activeRoleId;
            const TabIcon = r.icon;
            return (
              <button
                key={r.id}
                onClick={() => setActiveRoleId(r.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                    : "border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <TabIcon className="size-4" />
                <span>{r.roleTitle}</span>
              </button>
            );
          })}
        </div>

        {/* Content Box */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-lg sm:p-10">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            {/* Text details */}
            <div className="space-y-4 lg:col-span-7">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 border-primary/20 bg-primary/10 text-primary">
                  <IconComponent className="size-3.5" />
                  {currentRole.subtitle}
                </Badge>
              </div>

              <h3 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {currentRole.headline}
              </h3>

              <p className="text-sm leading-relaxed text-muted-foreground">
                {currentRole.description}
              </p>

              <div className="pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Key Operational Powers:</p>
                <ul className="mt-3 space-y-2.5">
                  {currentRole.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 text-xs font-medium text-foreground sm:text-sm">
                      <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Visual Callout Box */}
            <div className="lg:col-span-5">
              <div className="relative rounded-xl border border-border/80 bg-gradient-to-br from-muted/50 via-background to-muted/30 p-6 shadow-inner">
                <div className="flex items-center justify-between border-b border-border/50 pb-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-primary" />
                    <span className="font-heading text-sm font-bold text-foreground">Role Security Active</span>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                    Enforced by System
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <p className="text-xs font-semibold text-foreground">Role Permissions</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Strict access scope defined per tenant user</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <p className="text-xs font-semibold text-foreground">Operational Outcome</p>
                    <p className="mt-0.5 text-[11px] font-medium text-primary">{currentRole.metricsBadge}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
