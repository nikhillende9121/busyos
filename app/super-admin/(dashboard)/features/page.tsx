"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import { ApiError } from "@/lib/api/client";
import type { FeatureView } from "@/modules/super-admin/types/feature.types";

type CreateFeatureFormValues = { name: string; code: string };

const columns: DataTableColumn<FeatureView>[] = [
  { key: "name", header: "Name" },
  { key: "code", header: "Code" },
];

export default function SuperAdminFeaturesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: features, isLoading } = useQuery({
    queryKey: ["super-admin", "features"],
    queryFn: () => superAdminApiClient.get<FeatureView[]>("/features"),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateFeatureFormValues) => superAdminApiClient.post<FeatureView>("/features", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "features"] });
      toast.success("Feature created");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Features</h1>
          <p className="text-muted-foreground">The catalog of features that Plans can include.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New feature
        </Button>
      </div>

      <DataTable columns={columns} rows={features ?? []} isLoading={isLoading} getRowId={(row) => row.id} emptyMessage="No features yet." />

      {createOpen && (
        <CreateFeatureDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={async (values) => {
            await createMutation.mutateAsync(values);
          }}
        />
      )}
    </div>
  );
}

function CreateFeatureDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateFeatureFormValues) => Promise<void>;
}) {
  const form = useForm<CreateFeatureFormValues>({ defaultValues: { name: "", code: "" } });

  const handleSubmit = async (values: CreateFeatureFormValues) => {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New feature</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Advanced Reporting" {...form.register("name", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input id="code" placeholder="ADVANCED_REPORTING" {...form.register("code", { required: true })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create feature"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
