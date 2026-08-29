"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { DateRangeFilter, type DateRange } from "@/components/resource/date-range-filter";
import { ExportButton } from "@/components/resource/export-button";
import { ResourceFormDialog } from "@/components/resource/resource-form-dialog";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { createCustomerSchema, updateCustomerSchema } from "@/modules/customer/schema/customer.schema";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { CustomerGroupView } from "@/modules/pricing/types/customer-group.types";
import { INDIAN_STATE_OPTIONS } from "@/lib/constants/indian-states";
import type { Paginated } from "@/shared/utils/pagination";

const columns: DataTableColumn<CustomerView>[] = [
  { key: "name", header: "Name" },
  { key: "email", header: "Email", render: (row) => row.email ?? "—" },
  { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
];

// Customers grows large enough (unlike the other flat lookup tables built
// on ResourceCrudPage) to need pagination/date-filter/export, so this is a
// bespoke page rather than a ResourceCrudPage config — see
// components/resource/resource-crud-page.tsx's own comment on that split.
export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerView | null>(null);
  const [deleting, setDeleting] = useState<CustomerView | null>(null);
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>({});

  const { data: customersPage, isLoading } = useQuery({
    queryKey: queryKeys.list("customers", { page, ...dateRange }),
    queryFn: () => apiClient.get<Paginated<CustomerView>>("/customers", { page, pageSize: 20, ...dateRange }),
  });
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

  const fields = [
    { name: "name", label: "Name", placeholder: "Walk-in Customer" },
    { name: "email", label: "Email", placeholder: "customer@example.com" },
    { name: "phone", label: "Phone", placeholder: "+1 555 0100" },
    {
      name: "customerGroupId",
      label: "Customer group",
      type: "select" as const,
      placeholder: "No group",
      options: customerGroupOptions,
    },
    {
      name: "state",
      label: "State",
      type: "select" as const,
      placeholder: "Not set",
      options: INDIAN_STATE_OPTIONS,
      description: "Billing state — decides CGST+SGST vs IGST on sales to this customer.",
    },
  ];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.list("customers") });

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post<CustomerView>("/customers", values),
    onSuccess: () => {
      invalidate();
      toast.success("Customer created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      apiClient.put<CustomerView>(`/customers/${id}`, values),
    onSuccess: () => {
      invalidate();
      toast.success("Customer updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/customers/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Customer deleted");
    },
  });

  const canCreate = can("CUSTOMER.CREATE");
  const canUpdate = can("CUSTOMER.UPDATE");
  const canDelete = can("CUSTOMER.DELETE");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Customers</h1>
          <p className="text-muted-foreground">Customers this tenant sells to.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New customer
          </Button>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            setDateRange(next);
            setPage(1);
          }}
        />
        <ExportButton resource="customers" params={dateRange} />
      </div>

      <DataTable
        columns={columns}
        rows={customersPage?.items ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No customers yet."
        pagination={customersPage?.pagination}
        onPageChange={setPage}
        actions={
          canUpdate || canDelete
            ? (row) => (
                <div className="flex justify-end gap-2">
                  {canUpdate && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(row)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(row)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              )
            : undefined
        }
      />

      <ResourceFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New customer"
        schema={createCustomerSchema}
        fields={fields}
        defaultValues={{ name: "", email: "", phone: "", customerGroupId: undefined, state: undefined }}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
      />

      {editing && (
        <ResourceFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          title={`Edit ${editing.name}`}
          schema={updateCustomerSchema}
          fields={fields}
          defaultValues={{
            name: editing.name,
            email: editing.email ?? "",
            phone: editing.phone ?? "",
            customerGroupId: editing.customerGroupId ?? undefined,
            state: editing.state ?? undefined,
          }}
          onSubmit={async (values) => {
            await updateMutation.mutateAsync({ id: editing.id, values });
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await deleteMutation.mutateAsync(deleting.id);
          }}
        />
      )}
    </div>
  );
}
