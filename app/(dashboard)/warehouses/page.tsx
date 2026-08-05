"use client";

import { ResourceCrudPage } from "@/components/resource/resource-crud-page";
import type { DataTableColumn } from "@/components/resource/data-table";
import {
  createWarehouseSchema,
  updateWarehouseSchema,
} from "@/modules/warehouse/schema/warehouse.schema";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import { INDIAN_STATE_OPTIONS } from "@/lib/constants/indian-states";

const columns: DataTableColumn<WarehouseView>[] = [
  { key: "name", header: "Name" },
  { key: "code", header: "Code" },
  { key: "address", header: "Address", render: (row) => row.address ?? "—" },
  { key: "state", header: "State", render: (row) => row.state ?? "—" },
];

export default function WarehousesPage() {
  return (
    <ResourceCrudPage
      resource="warehouses"
      title="Warehouses"
      description="Stores/warehouses this tenant operates."
      permissionPrefix="WAREHOUSE"
      columns={columns}
      createSchema={createWarehouseSchema}
      updateSchema={updateWarehouseSchema}
      fields={[
        { name: "name", label: "Name", placeholder: "Main Warehouse" },
        { name: "code", label: "Code", placeholder: "MAIN" },
        { name: "address", label: "Address", type: "textarea" },
        {
          name: "state",
          label: "State",
          type: "select",
          placeholder: "Not set",
          options: INDIAN_STATE_OPTIONS,
          description: "Falls back to Settings' home state when unset — decides CGST+SGST vs IGST on sales from this store.",
        },
      ]}
      createDefaultValues={{ name: "", code: "", address: "", state: undefined }}
      getEditDefaultValues={(row: WarehouseView) => ({
        name: row.name,
        code: row.code,
        address: row.address ?? "",
        state: row.state ?? undefined,
      })}
      getRowLabel={(row: WarehouseView) => row.name}
    />
  );
}
