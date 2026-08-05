"use client";

import { useQuery } from "@tanstack/react-query";
import { ResourceCrudPage } from "@/components/resource/resource-crud-page";
import type { DataTableColumn } from "@/components/resource/data-table";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { createCustomerSchema, updateCustomerSchema } from "@/modules/customer/schema/customer.schema";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { CustomerGroupView } from "@/modules/pricing/types/customer-group.types";
import { INDIAN_STATE_OPTIONS } from "@/lib/constants/indian-states";

const columns: DataTableColumn<CustomerView>[] = [
  { key: "name", header: "Name" },
  { key: "email", header: "Email", render: (row) => row.email ?? "—" },
  { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
];

export default function CustomersPage() {
  // Feeds the customerGroupId select below — customer-groups is a small,
  // already-loaded list, so no pagination/search needed here.
  const { data: customerGroups } = useQuery({
    queryKey: queryKeys.list("customer-groups"),
    queryFn: () => apiClient.get<CustomerGroupView[]>("/customer-groups"),
  });

  const customerGroupOptions = (customerGroups ?? []).map((group) => ({
    label: group.name,
    value: group.id,
  }));

  return (
    <ResourceCrudPage
      resource="customers"
      title="Customers"
      description="Customers this tenant sells to."
      permissionPrefix="CUSTOMER"
      columns={columns}
      createSchema={createCustomerSchema}
      updateSchema={updateCustomerSchema}
      fields={[
        { name: "name", label: "Name", placeholder: "Walk-in Customer" },
        { name: "email", label: "Email", placeholder: "customer@example.com" },
        { name: "phone", label: "Phone", placeholder: "+1 555 0100" },
        {
          name: "customerGroupId",
          label: "Customer group",
          type: "select",
          placeholder: "No group",
          options: customerGroupOptions,
        },
        {
          name: "state",
          label: "State",
          type: "select",
          placeholder: "Not set",
          options: INDIAN_STATE_OPTIONS,
          description: "Billing state — decides CGST+SGST vs IGST on sales to this customer.",
        },
      ]}
      createDefaultValues={{ name: "", email: "", phone: "", customerGroupId: undefined, state: undefined }}
      getEditDefaultValues={(row: CustomerView) => ({
        name: row.name,
        email: row.email ?? "",
        phone: row.phone ?? "",
        customerGroupId: row.customerGroupId ?? undefined,
        state: row.state ?? undefined,
      })}
      getRowLabel={(row: CustomerView) => row.name}
    />
  );
}
