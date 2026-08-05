"use client";

import { ResourceCrudPage } from "@/components/resource/resource-crud-page";
import type { DataTableColumn } from "@/components/resource/data-table";
import {
  createCustomerGroupSchema,
  updateCustomerGroupSchema,
} from "@/modules/pricing/schema/customer-group.schema";
import type { CustomerGroupView } from "@/modules/pricing/types/customer-group.types";

const columns: DataTableColumn<CustomerGroupView>[] = [
  { key: "name", header: "Name" },
  { key: "code", header: "Code" },
];

export default function CustomerGroupsPage() {
  return (
    <ResourceCrudPage
      resource="customer-groups"
      title="Customer Groups"
      description="Segments used for group-specific pricing, discounts, and coupons."
      permissionPrefix="CUSTOMER_GROUP"
      columns={columns}
      createSchema={createCustomerGroupSchema}
      updateSchema={updateCustomerGroupSchema}
      fields={[
        { name: "name", label: "Name", placeholder: "Wholesale" },
        { name: "code", label: "Code", placeholder: "WHOLESALE" },
      ]}
      createDefaultValues={{ name: "", code: "" }}
      getEditDefaultValues={(row: CustomerGroupView) => ({ name: row.name, code: row.code })}
      getRowLabel={(row: CustomerGroupView) => row.name}
    />
  );
}
