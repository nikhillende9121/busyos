"use client";

import { useQuery } from "@tanstack/react-query";
import { ResourceCrudPage } from "@/components/resource/resource-crud-page";
import type { DataTableColumn } from "@/components/resource/data-table";
import { Badge } from "@/components/ui/badge";
import {
  createExtraChargeSchema,
  updateExtraChargeSchema,
} from "@/modules/extra-charge/schema/extra-charge.schema";
import type { ExtraChargeView } from "@/modules/extra-charge/types/extra-charge.types";
import type { TaxRateView } from "@/modules/tax-rate/types/tax-rate.types";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

const CHANNEL_OPTIONS = [
  { label: "POS", value: "POS" },
  { label: "Online", value: "ONLINE" },
  { label: "Marketplace", value: "MARKETPLACE" },
  { label: "Phone", value: "PHONE" },
];

const columns: DataTableColumn<ExtraChargeView>[] = [
  { key: "name", header: "Name" },
  {
    key: "calcType",
    header: "Type",
    render: (row) => (row.calcType === "FLAT" ? "Flat amount" : "Percentage"),
  },
  {
    key: "value",
    header: "Value",
    render: (row) => (row.calcType === "FLAT" ? row.value : `${row.value}%`),
  },
  {
    key: "applicableChannels",
    header: "Channels",
    render: (row) =>
      row.applicableChannels && row.applicableChannels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {row.applicableChannels.map((ch) => (
            <Badge key={ch} variant="outline" className="text-xs">
              {ch}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">All channels</span>
      ),
  },
  { key: "isTaxable", header: "Taxable", render: (row) => (row.isTaxable ? "Yes" : "No") },
];

export default function ExtraChargesPage() {
  const { data: taxRates } = useQuery({
    queryKey: queryKeys.list("tax-rates"),
    queryFn: () => apiClient.get<TaxRateView[]>("/tax-rates"),
  });
  const taxRateOptions = (taxRates ?? []).map((rate) => ({ label: `${rate.name} (${rate.ratePercent}%)`, value: rate.id }));

  return (
    <ResourceCrudPage
      resource="extra-charges"
      title="Extra charges"
      description="Invoice-level charges (shipping, packing, handling) — separate from tax, optionally taxable at one of your tax rates."
      permissionPrefix="EXTRA_CHARGE"
      columns={columns}
      createSchema={createExtraChargeSchema}
      updateSchema={updateExtraChargeSchema}
      fields={[
        { name: "name", label: "Name", placeholder: "Shipping" },
        {
          name: "calcType",
          label: "Type",
          type: "select",
          options: [
            { label: "Flat amount", value: "FLAT" },
            { label: "Percentage of order total", value: "PERCENTAGE" },
          ],
        },
        { name: "value", label: "Value", placeholder: "50", description: "A flat amount, or a percentage number (e.g. 2 for 2%)." },
        {
          name: "applicableChannels",
          label: "Applicable sales channels (optional)",
          type: "multiselect",
          options: CHANNEL_OPTIONS,
          description: "Leave empty to make applicable to all channels.",
        },
        { name: "isTaxable", label: "Taxable", type: "checkbox" },
        { name: "taxRateId", label: "Tax rate (if taxable)", type: "select", options: taxRateOptions },
      ]}
      createDefaultValues={{ name: "", calcType: "FLAT", value: "", applicableChannels: [], isTaxable: false, taxRateId: undefined }}
      getEditDefaultValues={(row: ExtraChargeView) => ({
        name: row.name,
        calcType: row.calcType,
        value: row.value,
        applicableChannels: row.applicableChannels ?? [],
        isTaxable: row.isTaxable,
        taxRateId: row.taxRateId ?? undefined,
      })}
      getRowLabel={(row: ExtraChargeView) => row.name}
    />
  );
}
