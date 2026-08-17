"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import { ApiError } from "@/lib/api/client";
import type { PlanView } from "@/modules/super-admin/types/plan.types";
import type { FeatureView } from "@/modules/super-admin/types/feature.types";

type PlanFormValues = {
  name: string;
  price: string;
  billingCycle: string;
  featureCodes: string[];
  maxWarehouses: string;
  maxUsers: string;
};

export default function SuperAdminPlansPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanView | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["super-admin", "plans"],
    queryFn: () => superAdminApiClient.get<PlanView[]>("/plans"),
  });
  const { data: features } = useQuery({
    queryKey: ["super-admin", "features"],
    queryFn: () => superAdminApiClient.get<FeatureView[]>("/features"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["super-admin", "plans"] });

  // Blank limit fields must be OMITTED, not sent as "" — the API treats an
  // omitted maxWarehouses/maxUsers as unlimited, but Number("") is 0, which
  // would be rejected by the schema's .positive() check instead.
  const toPayload = (values: PlanFormValues) => ({
    name: values.name,
    price: values.price,
    billingCycle: values.billingCycle,
    featureCodes: values.featureCodes,
    maxWarehouses: values.maxWarehouses ? Number(values.maxWarehouses) : undefined,
    maxUsers: values.maxUsers ? Number(values.maxUsers) : undefined,
  });

  const createMutation = useMutation({
    mutationFn: (values: PlanFormValues) => superAdminApiClient.post<PlanView>("/plans", toPayload(values)),
    onSuccess: () => {
      invalidate();
      toast.success("Plan created");
    },
  });

  // Every tenant currently on this plan is resynced server-side the
  // moment its features change — see
  // modules/super-admin/service/plan.service.ts's update(). Nothing extra
  // to trigger from here.
  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: PlanFormValues }) =>
      superAdminApiClient.put<PlanView>(`/plans/${id}`, toPayload(values)),
    onSuccess: () => {
      invalidate();
      toast.success("Plan updated — every tenant on it was resynced");
    },
  });

  const columns: DataTableColumn<PlanView>[] = [
    { key: "name", header: "Name" },
    { key: "price", header: "Price" },
    { key: "billingCycle", header: "Billing" },
    { key: "maxWarehouses", header: "Warehouse limit", render: (row) => row.maxWarehouses ?? "Unlimited" },
    { key: "maxUsers", header: "User limit", render: (row) => row.maxUsers ?? "Unlimited" },
    {
      key: "features",
      header: "Features",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.features.length === 0 ? "—" : row.features.map((code) => <Badge key={code} variant="outline">{code}</Badge>)}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button variant="ghost" size="icon-sm" onClick={() => setEditingPlan(row)} aria-label="Edit plan">
          <Pencil className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Plans</h1>
          <p className="text-muted-foreground">Subscription plans, and which features each one includes.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New plan
        </Button>
      </div>

      <DataTable columns={columns} rows={plans ?? []} isLoading={isLoading} getRowId={(row) => row.id} emptyMessage="No plans yet." />

      {createOpen && (
        <PlanFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="New plan"
          submitLabel="Create plan"
          features={features ?? []}
          defaultValues={{ name: "", price: "", billingCycle: "MONTHLY", featureCodes: [], maxWarehouses: "", maxUsers: "" }}
          onSubmit={async (values) => {
            await createMutation.mutateAsync(values);
          }}
        />
      )}

      {editingPlan && (
        <PlanFormDialog
          open={Boolean(editingPlan)}
          onOpenChange={(open) => !open && setEditingPlan(null)}
          title={`Edit ${editingPlan.name}`}
          submitLabel="Save changes"
          features={features ?? []}
          defaultValues={{
            name: editingPlan.name,
            price: editingPlan.price,
            billingCycle: editingPlan.billingCycle,
            featureCodes: editingPlan.features,
            maxWarehouses: editingPlan.maxWarehouses?.toString() ?? "",
            maxUsers: editingPlan.maxUsers?.toString() ?? "",
          }}
          onSubmit={async (values) => {
            await updateMutation.mutateAsync({ id: editingPlan.id, values });
          }}
        />
      )}
    </div>
  );
}

function PlanFormDialog({
  open,
  onOpenChange,
  title,
  submitLabel,
  features,
  defaultValues,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  features: FeatureView[];
  defaultValues: PlanFormValues;
  onSubmit: (values: PlanFormValues) => Promise<void>;
}) {
  const form = useForm<PlanFormValues>({ defaultValues });

  useEffect(() => {
    if (open) form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValues]);

  const handleSubmit = async (values: PlanFormValues) => {
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Starter" {...form.register("name", { required: true })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="price">Price</Label>
              <Input id="price" placeholder="999.00" {...form.register("price", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Billing cycle</Label>
              <Controller
                control={form.control}
                name="billingCycle"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="YEARLY">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="maxWarehouses">Warehouse limit</Label>
              <Input
                id="maxWarehouses"
                type="number"
                min={1}
                placeholder="Unlimited"
                {...form.register("maxWarehouses")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxUsers">User limit</Label>
              <Input id="maxUsers" type="number" min={1} placeholder="Unlimited" {...form.register("maxUsers")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Features included</Label>
            <Controller
              control={form.control}
              name="featureCodes"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3 sm:grid-cols-3">
                  {features.map((feature) => (
                    <label key={feature.code} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={field.value.includes(feature.code)}
                        onCheckedChange={(checked) => {
                          field.onChange(
                            checked
                              ? [...field.value, feature.code]
                              : field.value.filter((code) => code !== feature.code),
                          );
                        }}
                      />
                      {feature.name}
                    </label>
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
              {submitLabel}
            </LoaderButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
