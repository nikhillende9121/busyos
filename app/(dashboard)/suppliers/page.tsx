"use client";

import { ResourceCrudPage } from "@/components/resource/resource-crud-page";
import type { DataTableColumn } from "@/components/resource/data-table";
import { createSupplierSchema, updateSupplierSchema } from "@/modules/supplier/schema/supplier.schema";
import type { SupplierView } from "@/modules/supplier/types/supplier.types";
import { INDIAN_STATE_OPTIONS } from "@/lib/constants/indian-states";

const columns: DataTableColumn<SupplierView>[] = [
  { key: "name", header: "Name" },
  { key: "email", header: "Email", render: (row) => row.email ?? "—" },
  { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
];

export default function SuppliersPage() {
  return (
    <ResourceCrudPage
      resource="suppliers"
      title="Suppliers"
      description="Vendors this tenant purchases stock from."
      permissionPrefix="SUPPLIER"
      columns={columns}
      createSchema={createSupplierSchema}
      updateSchema={updateSupplierSchema}
      fields={[
        { name: "name", label: "Name", placeholder: "Acme Distributors" },
        { name: "email", label: "Email", placeholder: "orders@acme.example" },
        { name: "phone", label: "Phone", placeholder: "+1 555 0100" },
        {
          name: "state",
          label: "State",
          type: "select",
          placeholder: "Not set",
          options: INDIAN_STATE_OPTIONS,
          description: "Supplier's registered state — decides CGST+SGST vs IGST on purchases from them.",
        },
      ]}
      createDefaultValues={{ name: "", email: "", phone: "", state: undefined }}
      getEditDefaultValues={(row: SupplierView) => ({
        name: row.name,
        email: row.email ?? "",
        phone: row.phone ?? "",
        state: row.state ?? undefined,
      })}
      getRowLabel={(row: SupplierView) => row.name}
    />
  );
}
