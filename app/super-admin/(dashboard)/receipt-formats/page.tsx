"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Copy, Trash2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { AssignFormatDialog } from "./assign-format-dialog";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import { ApiError } from "@/lib/api/client";
import type { ReceiptFormatView } from "@/modules/receipt-format/types/receipt-format.types";

export default function SuperAdminReceiptFormatsPage() {
  const queryClient = useQueryClient();
  const [cloningFormat, setCloningFormat] = useState<ReceiptFormatView | null>(null);
  const [assigningFormat, setAssigningFormat] = useState<ReceiptFormatView | null>(null);
  const [deletingFormat, setDeletingFormat] = useState<ReceiptFormatView | null>(null);

  const { data: formats, isLoading } = useQuery({
    queryKey: ["super-admin", "receipt-formats"],
    queryFn: () => superAdminApiClient.get<ReceiptFormatView[]>("/receipt-formats"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["super-admin", "receipt-formats"] });

  const cloneMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      superAdminApiClient.post<ReceiptFormatView>(`/receipt-formats/${id}/clone`, { name }),
    onSuccess: () => {
      invalidate();
      toast.success("Receipt format cloned");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => superAdminApiClient.delete(`/receipt-formats/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Receipt format deleted");
    },
  });

  const columns: DataTableColumn<ReceiptFormatView>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <Link href={`/super-admin/receipt-formats/${row.id}`} className="underline underline-offset-2">
          {row.name}
        </Link>
      ),
    },
    { key: "paperWidth", header: "Paper width", render: (row) => `${row.paperWidth}mm` },
    { key: "version", header: "Version", render: (row) => `v${row.version}` },
    {
      key: "isDefault",
      header: "Default",
      render: (row) => (row.isDefault ? <Badge>Global default</Badge> : "—"),
    },
    {
      key: "assignments",
      header: "Assigned to",
      render: (row) =>
        row.assignments.length === 0 ? (
          <span className="text-muted-foreground">Not assigned</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.assignments.map((a, i) => (
              <Badge key={i} variant="outline">
                {a.scope}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setAssigningFormat(row)}>
            <Share2 className="size-3.5" /> Assign
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCloningFormat(row)}>
            <Copy className="size-3.5" /> Clone
          </Button>
          <Button variant="ghost" size="sm" render={<Link href={`/super-admin/receipt-formats/${row.id}`} />}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setDeletingFormat(row)} aria-label="Delete">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Receipt Formats</h1>
          <p className="text-muted-foreground">
            POS receipt templates the Android app renders — authored here, assigned to a tenant, store, or POS
            device.
          </p>
        </div>
        <Button render={<Link href="/super-admin/receipt-formats/new" />}>
          <Plus /> New format
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={formats ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No receipt formats yet."
      />

      {cloningFormat && (
        <CloneFormatDialog
          open={Boolean(cloningFormat)}
          onOpenChange={(open) => !open && setCloningFormat(null)}
          sourceName={cloningFormat.name}
          onSubmit={async (name) => {
            await cloneMutation.mutateAsync({ id: cloningFormat.id, name });
          }}
        />
      )}

      {assigningFormat && (
        <AssignFormatDialog
          open={Boolean(assigningFormat)}
          onOpenChange={(open) => !open && setAssigningFormat(null)}
          format={assigningFormat}
          onAssigned={invalidate}
        />
      )}

      {deletingFormat && (
        <ConfirmDialog
          open={Boolean(deletingFormat)}
          onOpenChange={(open) => !open && setDeletingFormat(null)}
          title={`Delete ${deletingFormat.name}?`}
          description="Any tenant, store, or POS device currently assigned to this format falls back to the next one in line (store, then tenant, then the global default). This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await deleteMutation.mutateAsync(deletingFormat.id);
          }}
        />
      )}
    </div>
  );
}

function CloneFormatDialog({
  open,
  onOpenChange,
  sourceName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const form = useForm<{ name: string }>({ defaultValues: { name: `${sourceName} (copy)` } });

  const handleSubmit = async (values: { name: string }) => {
    try {
      await onSubmit(values.name);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Clone &quot;{sourceName}&quot;</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cloneName">New format name</Label>
            <Input id="cloneName" {...form.register("name", { required: true })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <LoaderButton type="submit" loading={form.formState.isSubmitting}>
              Clone
            </LoaderButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

