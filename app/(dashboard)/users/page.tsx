"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { UserView } from "@/modules/user/types/user.types";
import type { RoleView } from "@/modules/role/types/role.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";

const UNRESTRICTED = "__unrestricted__";

type CreateUserFormValues = { name: string; email: string; password: string; roleId: string; warehouseId: string };
type UpdateUserFormValues = { name: string; roleId: string; status: string; warehouseId: string };

const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Invited", value: "INVITED" },
];

const columns: DataTableColumn<UserView>[] = [
  { key: "name", header: "Name" },
  { key: "email", header: "Email" },
  { key: "roleName", header: "Role", render: (row) => <Badge variant="outline">{row.roleName}</Badge> },
  { key: "warehouseName", header: "Store", render: (row) => row.warehouseName ?? "All stores" },
  {
    key: "status",
    header: "Status",
    render: (row) => <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>{row.status}</Badge>,
  },
];

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserView | null>(null);
  const [deleting, setDeleting] = useState<UserView | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: queryKeys.list("users"),
    queryFn: () => apiClient.get<UserView[]>("/users"),
  });
  const { data: roles } = useQuery({
    queryKey: queryKeys.list("roles"),
    queryFn: () => apiClient.get<RoleView[]>("/roles"),
  });
  const { data: warehouses } = useQuery({
    queryKey: queryKeys.list("warehouses"),
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.list("users") });

  const createMutation = useMutation({
    mutationFn: (values: {
      name: string;
      email: string;
      password: string;
      roleId: string;
      warehouseId?: string;
    }) => apiClient.post<UserView>("/users", values),
    onSuccess: () => {
      invalidate();
      toast.success("User created");
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: { name: string; roleId: string; status: string; warehouseId: string | null };
    }) => apiClient.put<UserView>(`/users/${id}`, values),
    onSuccess: () => {
      invalidate();
      toast.success("User updated");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/users/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("User deleted");
    },
  });

  const roleOptions = (roles ?? []).map((role) => ({ label: role.name, value: role.id }));
  const warehouseOptions = (warehouses ?? []).map((warehouse) => ({ label: warehouse.name, value: warehouse.id }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Users</h1>
          <p className="text-muted-foreground">Staff accounts for this tenant.</p>
        </div>
        {can("USER.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New user
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={users ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No users yet."
        actions={(row) => (
          <div className="flex justify-end gap-2">
            {can("USER.UPDATE") && (
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(row)}>
                <Pencil className="size-4" />
              </Button>
            )}
            {can("USER.DELETE") && (
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(row)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        )}
      />

      {createOpen && (
        <CreateUserDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          roleOptions={roleOptions}
          warehouseOptions={warehouseOptions}
          onSubmit={async (values) => {
            await createMutation.mutateAsync({
              ...values,
              warehouseId: values.warehouseId === UNRESTRICTED ? undefined : values.warehouseId,
            });
          }}
        />
      )}

      {editing && (
        <EditUserDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          user={editing}
          roleOptions={roleOptions}
          warehouseOptions={warehouseOptions}
          onSubmit={async (values) => {
            await updateMutation.mutateAsync({
              id: editing.id,
              values: {
                ...values,
                warehouseId: values.warehouseId === UNRESTRICTED ? null : values.warehouseId,
              },
            });
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

// Bespoke create/edit dialogs, not the generic ResourceFormDialog: create
// needs email+password, edit doesn't (see Docs/business-rules/roles-and-permissions.md
// -> User Management Is Deliberately Narrow in v1) — genuinely different
// field sets, same reasoning Purchases/Sales stayed off the generic scaffold.
function CreateUserDialog({
  open,
  onOpenChange,
  roleOptions,
  warehouseOptions,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleOptions: { label: string; value: string }[];
  warehouseOptions: { label: string; value: string }[];
  onSubmit: (values: CreateUserFormValues) => Promise<void>;
}) {
  const form = useForm<CreateUserFormValues>({
    defaultValues: { name: "", email: "", password: "", roleId: "", warehouseId: UNRESTRICTED },
  });

  const handleSubmit = async (values: CreateUserFormValues) => {
    try {
      await onSubmit(values);
      onOpenChange(false);
      form.reset();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register("name", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="At least 8 characters" {...form.register("password", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Controller
              control={form.control}
              name="roleId"
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Store (restrict to one warehouse)</Label>
            <Controller
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All stores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNRESTRICTED}>All stores (unrestricted)</SelectItem>
                    {warehouseOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              A store manager restricted here can only act on that one warehouse&apos;s data — see
              Docs/business-rules/roles-and-permissions.md.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  open,
  onOpenChange,
  user,
  roleOptions,
  warehouseOptions,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserView;
  roleOptions: { label: string; value: string }[];
  warehouseOptions: { label: string; value: string }[];
  onSubmit: (values: UpdateUserFormValues) => Promise<void>;
}) {
  const form = useForm<UpdateUserFormValues>({
    defaultValues: {
      name: user.name,
      roleId: user.roleId,
      status: user.status,
      warehouseId: user.warehouseId ?? UNRESTRICTED,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: user.name,
        roleId: user.roleId,
        status: user.status,
        warehouseId: user.warehouseId ?? UNRESTRICTED,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const handleSubmit = async (values: UpdateUserFormValues) => {
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {user.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" {...form.register("name", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Controller
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Store (restrict to one warehouse)</Label>
            <Controller
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All stores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNRESTRICTED}>All stores (unrestricted)</SelectItem>
                    {warehouseOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
