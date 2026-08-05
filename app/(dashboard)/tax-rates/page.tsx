"use client";

import { ResourceCrudPage } from "@/components/resource/resource-crud-page";
import type { DataTableColumn } from "@/components/resource/data-table";
import { createTaxRateSchema, updateTaxRateSchema } from "@/modules/tax-rate/schema/tax-rate.schema";
import type { TaxRateView } from "@/modules/tax-rate/types/tax-rate.types";

const columns: DataTableColumn<TaxRateView>[] = [
  { key: "name", header: "Name" },
  { key: "hsnCode", header: "HSN/SAC", render: (row) => row.hsnCode ?? row.sacCode ?? "—" },
  { key: "ratePercent", header: "Rate", render: (row) => `${row.ratePercent}%` },
  {
    key: "cessPercent",
    header: "Cess",
    render: (row) => (Number(row.cessPercent) > 0 ? `${row.cessPercent}%` : "—"),
  },
  { key: "isActive", header: "Active", render: (row) => (row.isActive ? "Yes" : "No") },
];

export default function TaxRatesPage() {
  return (
    <ResourceCrudPage
      resource="tax-rates"
      title="Tax rates"
      description="GST slabs this tenant uses — assigned per product, with a tenant-wide default fallback in Settings."
      permissionPrefix="TAX_RATE"
      columns={columns}
      createSchema={createTaxRateSchema}
      updateSchema={updateTaxRateSchema}
      fields={[
        { name: "name", label: "Name", placeholder: "GST 18%" },
        { name: "hsnCode", label: "HSN code", placeholder: "1006" },
        { name: "sacCode", label: "SAC code", placeholder: "9985" },
        { name: "ratePercent", label: "Rate %", placeholder: "18" },
        { name: "cessPercent", label: "Cess % (optional)", placeholder: "0" },
      ]}
      createDefaultValues={{ name: "", hsnCode: "", sacCode: "", ratePercent: "", cessPercent: "" }}
      getEditDefaultValues={(row: TaxRateView) => ({
        name: row.name,
        hsnCode: row.hsnCode ?? "",
        sacCode: row.sacCode ?? "",
        ratePercent: row.ratePercent,
        cessPercent: row.cessPercent,
      })}
      getRowLabel={(row: TaxRateView) => row.name}
    />
  );
}
