"use client";

import { useState } from "react";
import {
  Warehouse,
  Store,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Zap,
  Boxes,
  ShoppingCart,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface StoreData {
  id: string;
  name: string;
  type: "warehouse" | "store";
  activeShift: boolean;
  totalSkuCount: number;
  todaySales: string;
  stockHealth: number;
  recentActivity: { id: string; text: string; time: string; type: "sale" | "po" | "transfer" }[];
}

const STORES_DATA: StoreData[] = [
  {
    id: "main",
    name: "Central Logistics Warehouse",
    type: "warehouse",
    activeShift: true,
    totalSkuCount: 1420,
    todaySales: "₹1,84,200",
    stockHealth: 98,
    recentActivity: [
      { id: "1", text: "PO #892 Received — 250 units Barcode Scanners", time: "2m ago", type: "po" },
      { id: "2", text: "Transfer #ST-409 Shipped to Downtown Branch", time: "14m ago", type: "transfer" },
      { id: "3", text: "Stock Audit Verified — Zero Variance", time: "45m ago", type: "sale" },
    ],
  },
  {
    id: "downtown",
    name: "Downtown Flagship Store",
    type: "store",
    activeShift: true,
    totalSkuCount: 890,
    todaySales: "₹64,850",
    stockHealth: 94,
    recentActivity: [
      { id: "1", text: "POS Sale #1042 — 3 items (Tier-1 Customer Discount)", time: "1m ago", type: "sale" },
      { id: "2", text: "Exchange Completed #EX-88 — Returned 1x Item A, Sold 1x Item B", time: "8m ago", type: "sale" },
      { id: "3", text: "Cash Till Session Reconciled — Opening Float ₹5,000", time: "3h ago", type: "transfer" },
    ],
  },
  {
    id: "westside",
    name: "Westside Retail Branch",
    type: "store",
    activeShift: true,
    totalSkuCount: 650,
    todaySales: "₹38,120",
    stockHealth: 91,
    recentActivity: [
      { id: "1", text: "POS Sale #883 — Paid via UPI (Till #2)", time: "4m ago", type: "sale" },
      { id: "2", text: "Stock Low Warning: Wireless Mouse (3 units left)", time: "22m ago", type: "po" },
      { id: "3", text: "Received Stock Transfer #ST-405 from Central", time: "1h ago", type: "transfer" },
    ],
  },
];

export function HeroPreview() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>("downtown");
  const currentStore = STORES_DATA.find((s) => s.id === selectedStoreId) || STORES_DATA[0];

  return (
    <div className="relative mx-auto w-full max-w-5xl rounded-2xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-xl sm:p-6 md:p-8">
      {/* Decorative gradient glowing orb behind container */}
      <div className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-64 w-full -translate-x-1/2 rounded-full bg-gradient-to-r from-primary/20 via-indigo-500/10 to-purple-500/20 blur-3xl opacity-70" />

      {/* Top Header Bar */}
      <div className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner">
            <Boxes className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-heading text-base font-bold tracking-tight text-foreground sm:text-lg">
                RetailX Live Multi-Store Command
              </span>
              <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Sync Live
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Real-time inventory ledger & POS till reconciliation across all branches</p>
          </div>
        </div>

        {/* Store Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 p-1">
          {STORES_DATA.map((s) => {
            const isActive = s.id === selectedStoreId;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedStoreId(s.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.type === "warehouse" ? <Warehouse className="size-3.5 text-primary" /> : <Store className="size-3.5 text-indigo-500" />}
                <span>{s.name.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Preview Grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {/* Metric 1 */}
        <div className="group rounded-xl border border-border/50 bg-background/60 p-4 transition-all hover:border-primary/40 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Today's Revenue</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground">{currentStore.todaySales}</p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <ArrowUpRight className="size-3" />
            <span>+18.4% vs yesterday</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="group rounded-xl border border-border/50 bg-background/60 p-4 transition-all hover:border-primary/40 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Tracked SKUs</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4" />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold tracking-tight text-foreground">{currentStore.totalSkuCount.toLocaleString()} SKUs</p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="size-3 text-emerald-500" />
            <span>100% stock count accuracy</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="group rounded-xl border border-border/50 bg-background/60 p-4 transition-all hover:border-primary/40 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Till & Shift Status</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <ShoppingCart className="size-4" />
            </div>
          </div>
          <p className="mt-2 font-heading text-lg font-semibold tracking-tight text-foreground">
            Shift Active • Till #1
          </p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <Zap className="size-3" />
            <span>Cash drawer balanced</span>
          </div>
        </div>
      </div>

      {/* Interactive Stock & Activity Live Feed */}
      <div className="mt-6 rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin text-primary opacity-80" style={{ animationDuration: "8s" }} />
            <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Live Audit & Event Stream — {currentStore.name}
            </h4>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">Immutable Ledger</span>
        </div>

        <div className="mt-3 space-y-2.5">
          {currentStore.recentActivity.map((act) => (
            <div
              key={act.id}
              className="flex items-start justify-between rounded-lg border border-border/40 bg-background/80 px-3 py-2.5 text-xs transition-colors hover:bg-background"
            >
              <div className="flex items-start gap-2.5">
                {act.type === "sale" && (
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                    <ArrowDownLeft className="size-3" />
                  </span>
                )}
                {act.type === "po" && (
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600">
                    <ArrowUpRight className="size-3" />
                  </span>
                )}
                {act.type === "transfer" && (
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-600">
                    <Boxes className="size-3" />
                  </span>
                )}
                <div>
                  <p className="font-medium text-foreground">{act.text}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Auto-synced with central ledger & tax log</p>
                </div>
              </div>
              <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{act.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
