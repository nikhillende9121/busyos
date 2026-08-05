"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { FieldValues, DefaultValues } from "react-hook-form";
import type { ZodType } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { ResourceFormDialog, type ResourceFormField } from "@/components/resource/resource-form-dialog";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";

// Generalized from the Warehouses reference module once six more modules
// (Categories, Brands, Units, Suppliers, Customers, Customer Groups) turned
// out to need the exact same flat list/create/edit/delete shape — one
// config object per resource instead of copy-pasting the page. Modules
// with real lifecycle actions (purchases, sales, stock transfers) or
// nested line items still get their own page; this is only for plain CRUD.
export type ResourceCrudPageConfig<
  TView extends Record<string, unknown>,
  TCreate extends FieldValues,
  TUpdate extends FieldValues,
> = {
  resource: string;
  title: string;
  description?: string;
  /** Every module here follows the "<PREFIX>.VIEW/CREATE/UPDATE/DELETE" permission convention. */
  permissionPrefix: string;
  columns: DataTableColumn<TView>[];
  createSchema: ZodType<TCreate>;
  updateSchema: ZodType<TUpdate>;
  fields: ResourceFormField[];
  createDefaultValues: DefaultValues<TCreate>;
  getEditDefaultValues: (row: TView) => DefaultValues<TUpdate>;
  getRowLabel: (row: TView) => string;
  getRowId?: (row: TView) => string;
  emptyMessage?: string;
};

export function ResourceCrudPage<
  TView extends Record<string, unknown> & { id: string },
  TCreate extends FieldValues,
  TUpdate extends FieldValues,
>(config: ResourceCrudPageConfig<TView, TCreate, TUpdate>) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TView | null>(null);
  const [deleting, setDeleting] = useState<TView | null>(null);

  const getRowId = config.getRowId ?? ((row: TView) => row.id);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.list(config.resource),
    queryFn: () => apiClient.get<TView[]>(`/${config.resource}`),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.list(config.resource) });

  const createMutation = useMutation({
    mutationFn: (values: TCreate) => apiClient.post<TView>(`/${config.resource}`, values),
    onSuccess: () => {
      invalidate();
      toast.success(`${config.title.replace(/s$/, "")} created`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: TUpdate }) =>
      apiClient.put<TView>(`/${config.resource}/${id}`, values),
    onSuccess: () => {
      invalidate();
      toast.success(`${config.title.replace(/s$/, "")} updated`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/${config.resource}/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success(`${config.title.replace(/s$/, "")} deleted`);
    },
  });

  const canCreate = can(`${config.permissionPrefix}.CREATE`);
  const canUpdate = can(`${config.permissionPrefix}.UPDATE`);
  const canDelete = can(`${config.permissionPrefix}.DELETE`);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{config.title}</h1>
          {config.description && <p className="text-muted-foreground">{config.description}</p>}
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New {config.title.replace(/s$/, "").toLowerCase()}
          </Button>
        )}
      </div>

      <DataTable
        columns={config.columns}
        rows={data ?? []}
        isLoading={isLoading}
        getRowId={getRowId}
        emptyMessage={config.emptyMessage ?? `No ${config.title.toLowerCase()} yet.`}
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
        title={`New ${config.title.replace(/s$/, "").toLowerCase()}`}
        schema={config.createSchema}
        fields={config.fields}
        defaultValues={config.createDefaultValues}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
      />

      {editing && (
        <ResourceFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          title={`Edit ${config.getRowLabel(editing)}`}
          schema={config.updateSchema}
          fields={config.fields}
          defaultValues={config.getEditDefaultValues(editing)}
          onSubmit={async (values) => {
            await updateMutation.mutateAsync({ id: getRowId(editing), values });
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => !open && setDeleting(null)}
          title={`Delete ${config.getRowLabel(deleting)}?`}
          description="This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await deleteMutation.mutateAsync(getRowId(deleting));
          }}
        />
      )}
    </div>
  );
}
