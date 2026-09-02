"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { RoleView, PermissionCatalogEntry } from "@/modules/role/types/role.types";

type RoleFormValues = { name: string; code: string; permissionCodes: string[] };

const columns: DataTableColumn<RoleView>[] = [
  { key: "name", header: "Name" },
  { key: "code", header: "Code" },
  { key: "permissions", header: "Permissions", render: (row) => <Badge variant="outline">{row.permissions.length} granted</Badge> },
];

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<RoleView | null>(null);
  const [deleting, setDeleting] = useState<RoleView | null>(null);

  const { data: roles, isLoading } = useQuery({
    queryKey: queryKeys.list("roles"),
    queryFn: () => apiClient.get<RoleView[]>("/roles"),
  });
  const { data: permissionCatalog } = useQuery({
    queryKey: queryKeys.list("permissions"),
    queryFn: () => apiClient.get<PermissionCatalogEntry[]>("/permissions"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.list("roles") });

  const createMutation = useMutation({
    mutationFn: (values: RoleFormValues) => apiClient.post<RoleView>("/roles", values),
    onSuccess: () => {
      invalidate();
      toast.success("Role created");
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: RoleFormValues }) => apiClient.put<RoleView>(`/roles/${id}`, values),
    onSuccess: () => {
      invalidate();
      toast.success("Role updated");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/roles/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Role deleted");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Roles</h1>
          <p className="text-muted-foreground">Control which permissions apply to which staff.</p>
        </div>
        {can("ROLE.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New role
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={roles ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No roles yet."
        actions={(row) => (
          <div className="flex justify-end gap-2">
            {row.code === "ADMIN" ? (
              <span className="text-xs text-muted-foreground">System role</span>
            ) : (
              <>
                {can("ROLE.UPDATE") && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(row)}>
                    <Pencil className="size-4" />
                  </Button>
                )}
                {can("ROLE.DELETE") && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(row)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      />

      {createOpen && (
        <RoleFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="New role"
          permissionCatalog={permissionCatalog ?? []}
          defaultValues={{ name: "", code: "", permissionCodes: [] }}
          onSubmit={async (values) => {
            await createMutation.mutateAsync(values);
          }}
        />
      )}

      {editing && (
        <RoleFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          title={`Edit ${editing.name}`}
          permissionCatalog={permissionCatalog ?? []}
          defaultValues={{ name: editing.name, code: editing.code, permissionCodes: editing.permissions }}
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
          description="Roles still assigned to a user can't be deleted — reassign those users first."
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

// Bespoke, not the generic ResourceFormDialog: the permission field is a
// checklist grouped by module, not a flat field set (same reasoning
// Discounts/Coupons stayed off the generic scaffold for their
// productIds/categoryIds arrays).
function RoleFormDialog({
  open,
  onOpenChange,
  title,
  permissionCatalog,
  defaultValues,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  permissionCatalog: PermissionCatalogEntry[];
  defaultValues: RoleFormValues;
  onSubmit: (values: RoleFormValues) => Promise<void>;
}) {
  const form = useForm<RoleFormValues>({ defaultValues });

  useEffect(() => {
    if (open) form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValues]);

  const grouped = permissionCatalog.reduce<Record<string, PermissionCatalogEntry[]>>((acc, permission) => {
    (acc[permission.module] ??= []).push(permission);
    return acc;
  }, {});

  const handleSubmit = async (values: RoleFormValues) => {
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Cashier" {...form.register("name", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" placeholder="CASHIER" {...form.register("code", { required: true })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Permissions</Label>
            <Controller
              control={form.control}
              name="permissionCodes"
              render={({ field }) => (
                <div className="space-y-4 rounded-md border p-3">
                  {Object.entries(grouped).map(([module, permissions]) => (
                    <div key={module} className="space-y-1.5">
                      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{module}</p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {permissions.map((permission) => (
                          <label key={permission.code} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={field.value.includes(permission.code)}
                              onCheckedChange={(checked) => {
                                field.onChange(
                                  checked
                                    ? [...field.value, permission.code]
                                    : field.value.filter((code) => code !== permission.code),
                                );
                              }}
                            />
                            {permission.action}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <LoaderButton type="submit" loading={form.formState.isSubmitting}>
              Save
            </LoaderButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
