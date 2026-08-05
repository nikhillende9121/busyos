"use client";

import { useQuery } from "@tanstack/react-query";
import { ResourceCrudPage } from "@/components/resource/resource-crud-page";
import type { DataTableColumn } from "@/components/resource/data-table";
import {
  createExtraChargeSchema,
  updateExtraChargeSchema,
} from "@/modules/extra-charge/schema/extra-charge.schema";
import type { ExtraChargeView } from "@/modules/extra-charge/types/extra-charge.types";
import type { TaxRateView } from "@/modules/tax-rate/types/tax-rate.types";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

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
        { name: "isTaxable", label: "Taxable", type: "checkbox" },
        { name: "taxRateId", label: "Tax rate (if taxable)", type: "select", options: taxRateOptions },
      ]}
      createDefaultValues={{ name: "", calcType: "FLAT", value: "", isTaxable: false, taxRateId: undefined }}
      getEditDefaultValues={(row: ExtraChargeView) => ({
        name: row.name,
        calcType: row.calcType,
        value: row.value,
        isTaxable: row.isTaxable,
        taxRateId: row.taxRateId ?? undefined,
      })}
      getRowLabel={(row: ExtraChargeView) => row.name}
    />
  );
}
