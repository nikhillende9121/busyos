"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Upload, X, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import { ApiError } from "@/lib/api/client";
import type { SuperAdminTenantView } from "@/modules/super-admin/types/tenant.types";
import type { PlanView } from "@/modules/super-admin/types/plan.types";

const STATUS_OPTIONS = ["ACTIVE", "TRIAL", "SUSPENDED", "CANCELLED"];

type CreateTenantFormValues = {
  name: string;
  code: string;
  planId: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
};

export default function SuperAdminTenantsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: tenants, isLoading } = useQuery({
    queryKey: ["super-admin", "tenants"],
    queryFn: () => superAdminApiClient.get<SuperAdminTenantView[]>("/tenants"),
  });
  const { data: plans } = useQuery({
    queryKey: ["super-admin", "plans"],
    queryFn: () => superAdminApiClient.get<PlanView[]>("/plans"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });

  const createMutation = useMutation({
    mutationFn: (values: CreateTenantFormValues) =>
      superAdminApiClient.post<SuperAdminTenantView>("/tenants", values),
    onSuccess: () => {
      invalidate();
      toast.success("Tenant created");
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      superAdminApiClient.put<SuperAdminTenantView>(`/tenants/${id}/status`, { status }),
    onSuccess: () => {
      invalidate();
      toast.success("Tenant status updated");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  const planOptions = (plans ?? []).map((plan) => ({ label: plan.name, value: plan.id }));

  const columns: DataTableColumn<SuperAdminTenantView>[] = [
    { key: "logo", header: "Logo", render: (row) => <TenantLogoCell tenant={row} onChanged={invalidate} /> },
    { key: "name", header: "Name" },
    { key: "code", header: "Code" },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Select
          value={row.status}
          onValueChange={(status) => {
            if (status) statusMutation.mutate({ id: row.id, status });
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    { key: "createdAt", header: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Tenants</h1>
          <p className="text-muted-foreground">Every tenant on the platform.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New tenant
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={tenants ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No tenants yet."
      />

      {createOpen && (
        <CreateTenantDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          planOptions={planOptions}
          onSubmit={(values) => createMutation.mutateAsync(values)}
        />
      )}
    </div>
  );
}

// Upload/remove act on the tenant immediately (no separate save step) —
// same "act on the persisted row, not draft form state" precedent as the
// product image gallery (components/resource/line-items-field.tsx's
// neighbor, app/(dashboard)/products/page.tsx's ProductImagesDialog).
function TenantLogoCell({ tenant, onChanged }: { tenant: SuperAdminTenantView; onChanged: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return superAdminApiClient.upload<SuperAdminTenantView>(`/tenants/${tenant.id}/logo`, formData);
    },
    onSuccess: () => {
      onChanged();
      toast.success("Logo uploaded");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => superAdminApiClient.delete<SuperAdminTenantView>(`/tenants/${tenant.id}/logo`),
    onSuccess: () => {
      onChanged();
      toast.success("Logo removed");
    },
  });

  return (
    <div className="flex items-center gap-1.5">
      {tenant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
        <img src={tenant.logoUrl} alt="" className="size-8 rounded object-contain" />
      ) : (
        <div className="flex size-8 items-center justify-center rounded bg-muted text-muted-foreground">
          <ImageOff className="size-4" />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) uploadMutation.mutate(file);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={uploadMutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
      </Button>
      {tenant.logoUrl && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={removeMutation.isPending}
          onClick={() => removeMutation.mutate()}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

// Creating a tenant also bootstraps its first Admin role and admin user in
// one step (see modules/super-admin/service/tenant.service.ts) — without
// this, a newly created tenant would have no way for anyone to log into it.
// The logo (if picked) is uploaded as a second call once the tenant
// exists, rather than folding it into this JSON create request — same
// "create first, upload after" precedent as product images, and it keeps
// this endpoint's admin-bootstrap fields plain JSON.
function CreateTenantDialog({
  open,
  onOpenChange,
  planOptions,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planOptions: { label: string; value: string }[];
  onSubmit: (values: CreateTenantFormValues) => Promise<SuperAdminTenantView>;
}) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const form = useForm<CreateTenantFormValues>({
    defaultValues: { name: "", code: "", planId: "", adminName: "", adminEmail: "", adminPassword: "" },
  });

  const handleSubmit = async (values: CreateTenantFormValues) => {
    try {
      const tenant = await onSubmit(values);
      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        try {
          await superAdminApiClient.upload(`/tenants/${tenant.id}/logo`, formData);
        } catch {
          toast.error("Tenant created, but the logo upload failed — you can retry it from the tenants table.");
        }
      }
      onOpenChange(false);
      form.reset();
      setLogoFile(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New tenant</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Acme Retail" {...form.register("name", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" placeholder="acme" {...form.register("code", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Plan</Label>
            <Controller
              control={form.control}
              name="planId"
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {planOptions.map((option) => (
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
            <Label htmlFor="adminName">First admin — name</Label>
            <Input id="adminName" {...form.register("adminName", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adminEmail">First admin — email</Label>
            <Input id="adminEmail" type="email" {...form.register("adminEmail", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adminPassword">First admin — password</Label>
            <Input
              id="adminPassword"
              type="password"
              placeholder="At least 8 characters"
              {...form.register("adminPassword", { required: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="logo">Logo (optional)</Label>
            <Input
              id="logo"
              type="file"
              accept="image/*"
              onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create tenant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
