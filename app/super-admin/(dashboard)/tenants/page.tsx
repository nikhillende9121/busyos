"use client";

import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Upload, X, ImageOff, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import { ApiError } from "@/lib/api/client";
import type { SuperAdminTenantView } from "@/modules/super-admin/types/tenant.types";
import type { PlanView } from "@/modules/super-admin/types/plan.types";
import type { ContractView } from "@/modules/super-admin/types/subscription.types";

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
  const [contractTenant, setContractTenant] = useState<SuperAdminTenantView | null>(null);

  const planOptions = (plans ?? []).map((plan) => ({ label: plan.name, value: plan.id }));

  const columns: DataTableColumn<SuperAdminTenantView>[] = [
    { key: "logo", header: "Logo", render: (row) => <TenantLogoCell tenant={row} onChanged={invalidate} /> },
    { key: "name", header: "Name" },
    { key: "code", header: "Code" },
    { key: "plan", header: "Plan", render: (row) => row.currentPlanName ?? "No plan" },
    {
      key: "contract",
      header: "Contract",
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => setContractTenant(row)}>
          <FileText className="size-4" /> Manage contract
        </Button>
      ),
    },
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

      {contractTenant && (
        <TenantContractDialog
          open={Boolean(contractTenant)}
          onOpenChange={(open) => !open && setContractTenant(null)}
          tenant={contractTenant}
          planOptions={planOptions}
          onChanged={invalidate}
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

type CreateContractFormValues = {
  planId: string;
  startDate: string;
  endDate: string;
};

const money = (value: string) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 });

// Only one active/unexpired contract at a time — creating a new one is
// blocked server-side (409 CONFLICT, see modules/super-admin/service/
// subscription.service.ts) while one exists, so this dialog only shows the
// create form once there truly isn't a current contract, and otherwise
// offers the explicit Cancel action that's the only way to make room for
// one early. Contracts themselves are never edited, only created/cancelled.
function TenantContractDialog({
  open,
  onOpenChange,
  tenant,
  planOptions,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: SuperAdminTenantView;
  planOptions: { label: string; value: string }[];
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const form = useForm<CreateContractFormValues>({ defaultValues: { planId: "", startDate: "", endDate: "" } });

  const contractsKey = ["super-admin", "tenants", tenant.id, "subscriptions"];
  const { data: contracts, isLoading } = useQuery({
    queryKey: contractsKey,
    queryFn: () => superAdminApiClient.get<ContractView[]>(`/tenants/${tenant.id}/subscriptions`),
    enabled: open,
  });

  const invalidateContracts = () => {
    queryClient.invalidateQueries({ queryKey: contractsKey });
    onChanged();
  };

  const createMutation = useMutation({
    mutationFn: (values: CreateContractFormValues) =>
      superAdminApiClient.post<ContractView>(`/tenants/${tenant.id}/subscriptions`, values),
    onSuccess: () => {
      invalidateContracts();
      toast.success("Contract created");
      form.reset({ planId: "", startDate: "", endDate: "" });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      superAdminApiClient.post<ContractView>(`/tenants/${tenant.id}/subscriptions/${subscriptionId}/cancel`),
    onSuccess: () => {
      invalidateContracts();
      toast.success("Contract cancelled");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  const current = contracts?.find(
    (contract) => (contract.status === "ACTIVE" || contract.status === "TRIAL") && !contract.isExpiredByDate,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tenant.name} — Contracts</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !contracts || contracts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No contracts yet.
                  </TableCell>
                </TableRow>
              ) : (
                contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>{contract.planName}</TableCell>
                    <TableCell>{money(contract.priceAtSigning)}</TableCell>
                    <TableCell>{new Date(contract.startDate).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(contract.endDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={contract.isExpiredByDate ? "secondary" : contract.status === "CANCELLED" ? "outline" : "default"}>
                        {contract.isExpiredByDate ? "Expired" : contract.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {contract.id === current?.id && (
                        <Button variant="ghost" size="sm" onClick={() => setCancelTargetId(contract.id)}>
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {current ? (
            <p className="text-sm text-muted-foreground">
              This tenant has an active contract running until {new Date(current.endDate).toLocaleDateString()}.
              Cancel it above before creating a new one.
            </p>
          ) : (
            <form
              onSubmit={form.handleSubmit((values) => createMutation.mutateAsync(values))}
              className="space-y-3 rounded-md border p-3"
            >
              <p className="text-sm font-medium">New contract</p>
              <div className="grid grid-cols-3 gap-3">
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
                  <Label htmlFor="startDate">Start date</Label>
                  <Input id="startDate" type="date" {...form.register("startDate", { required: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endDate">End date</Label>
                  <Input id="endDate" type="date" {...form.register("endDate", { required: true })} />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create contract"}
              </Button>
            </form>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      {cancelTargetId && (
        <ConfirmDialog
          open={Boolean(cancelTargetId)}
          onOpenChange={(open) => !open && setCancelTargetId(null)}
          title="Cancel this contract?"
          description="The tenant's plan features will be disabled immediately. This cannot be undone."
          confirmLabel="Cancel contract"
          destructive
          onConfirm={async () => {
            await cancelMutation.mutateAsync(cancelTargetId);
          }}
        />
      )}
    </Dialog>
  );
}
