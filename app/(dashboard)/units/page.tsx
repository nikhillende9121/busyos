"use client";

import { ResourceCrudPage } from "@/components/resource/resource-crud-page";
import type { DataTableColumn } from "@/components/resource/data-table";
import { Badge } from "@/components/ui/badge";
import { createUnitSchema, updateUnitSchema } from "@/modules/product/schema/unit.schema";
import type { UnitView } from "@/modules/product/types/unit.types";

const columns: DataTableColumn<UnitView>[] = [
  { key: "name", header: "Name" },
  { key: "symbol", header: "Symbol" },
  {
    key: "isShared",
    header: "Scope",
    render: (row) => <Badge variant={row.isShared ? "secondary" : "outline"}>{row.isShared ? "Shared" : "Tenant"}</Badge>,
  },
];

export default function UnitsPage() {
  return (
    <ResourceCrudPage
      resource="units"
      title="Units"
      description="Units of measure (kg, litre, piece, ...)."
      permissionPrefix="UNIT"
      columns={columns}
      createSchema={createUnitSchema}
      updateSchema={updateUnitSchema}
      fields={[
        { name: "name", label: "Name", placeholder: "Kilogram" },
        { name: "symbol", label: "Symbol", placeholder: "kg" },
      ]}
      createDefaultValues={{ name: "", symbol: "" }}
      getEditDefaultValues={(row: UnitView) => ({ name: row.name, symbol: row.symbol })}
      getRowLabel={(row: UnitView) => row.name}
    />
  );
}
