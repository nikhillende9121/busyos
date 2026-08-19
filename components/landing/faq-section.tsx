"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "How does RetailX handle multiple physical stores and warehouses?",
    answer:
      "RetailX was engineered ground-up for multi-location businesses. Every purchase, sale, inter-store stock transfer, and inventory adjustment updates a single real-time ledger. You can manage 1 store or 50 branches from one central dashboard while maintaining store-specific pricing, stock counts, and shift sessions.",
  },
  {
    question: "Can store cashiers edit item prices or give unapproved discounts?",
    answer:
      "No. System access is strictly governed by role-based access control (RBAC). Cashier logins are restricted to the POS checkout screen and cannot alter master unit prices or issue unauthorized refunds. All discounts must conform to central discount rules or coupon codes set by store managers or administrators.",
  },
  {
    question: "How does stock transfer between stores work?",
    answer:
      "Stock transfers follow a two-step ship and receive workflow. When a warehouse ships 50 units to a retail branch, stock is marked in-transit until the destination branch manager confirms receipt. This eliminates phantom inventory loss between locations.",
  },
  {
    question: "Does RetailX support GST taxes, extra charges, and compliance reports?",
    answer:
      "Yes! You can configure flexible tax components (CGST, SGST, IGST, CESS) per product or tenant-wide, plus flat/percentage extra charges (shipping, packing). The system automatically generatesperiod GST tax liability reports showing output tax vs input tax credit.",
  },
  {
    question: "Does RetailX work with barcode scanners and receipt printers?",
    answer:
      "Yes. The store POS checkout screen supports standard USB and Bluetooth barcode scanners, ESC/POS thermal receipt printers, and cash drawers. Cashiers can ring up sales with rapid barcode scans and print receipts in seconds.",
  },
  {
    question: "How long does it take to onboard and import existing inventory?",
    answer:
      "Setting up a new store takes minutes. You can bulk import your existing product catalog, SKUs, initial stock quantities, and customer directories using CSV/Excel templates directly from your dashboard.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="border-t bg-background py-20">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center">
          <Badge variant="outline" className="mb-3 border-indigo-500/30 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400">
            Got Questions?
          </Badge>
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Everything you need to know about setting up, managing, and scaling your retail business on RetailX.
          </p>
        </div>

        <div className="mt-12 space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;

            return (
              <div
                key={faq.question}
                className="overflow-hidden rounded-xl border border-border/70 bg-card transition-all duration-200"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-muted/30"
                >
                  <span className="font-heading text-sm font-bold text-foreground sm:text-base">
                    {faq.question}
                  </span>
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full bg-muted transition-transform duration-200 ${
                      isOpen ? "rotate-180 bg-primary/10 text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <ChevronDown className="size-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border/40 bg-muted/10 p-5 pt-4 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
