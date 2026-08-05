"use client";

import { useState } from "react";
import { useForm, type FieldValues, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ZodType } from "zod";
import { Plus, Pencil, Trash2, ImageOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import {
  createBrandSchema,
  updateBrandSchema,
  type CreateBrandInput,
  type UpdateBrandInput,
} from "@/modules/product/schema/brand.schema";
import type { BrandView } from "@/modules/product/types/brand.types";

type BrandFormValues = { name: string };

// Standalone (not ResourceCrudPage) — same reasoning as
// app/(dashboard)/categories/page.tsx: image upload needs to live inside
// this same create/edit form, which ResourceFormDialog's JSON-only
// fields[] can't support.
export default function BrandsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BrandView | null>(null);
  const [deleting, setDeleting] = useState<BrandView | null>(null);

  const { data: brands, isLoading } = useQuery({
    queryKey: queryKeys.list("brands"),
    queryFn: () => apiClient.get<BrandView[]>("/brands"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.list("brands") });

  const createMutation = useMutation({
    mutationFn: (values: CreateBrandInput) => apiClient.post<BrandView>("/brands", values),
    onSuccess: () => {
      invalidate();
      toast.success("Brand created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateBrandInput }) =>
      apiClient.put<BrandView>(`/brands/${id}`, values),
    onSuccess: () => {
      invalidate();
      toast.success("Brand updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/brands/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Brand deleted");
    },
  });

  const columns: DataTableColumn<BrandView>[] = [
    {
      key: "image",
      header: "",
      render: (row) =>
        row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
          <img src={row.imageUrl} alt="" className="size-10 rounded object-cover" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
            <ImageOff className="size-4" />
          </div>
        ),
    },
    { key: "name", header: "Name" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Brands</h1>
          <p className="text-muted-foreground">Product brands/manufacturers.</p>
        </div>
        {can("BRAND.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New brand
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={brands ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No brands yet."
        actions={(row) => (
          <div className="flex justify-end gap-2">
            {can("BRAND.UPDATE") && (
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(row)}>
                <Pencil className="size-4" />
              </Button>
            )}
            {can("BRAND.DELETE") && (
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(row)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        )}
      />

      {createOpen && (
        <BrandFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="New brand"
          schema={createBrandSchema}
          defaultValues={{ name: "" }}
          onSubmit={(values) => createMutation.mutateAsync(values as CreateBrandInput)}
          onImageChanged={invalidate}
        />
      )}

      {editing && (
        <BrandFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          title={`Edit ${editing.name}`}
          schema={updateBrandSchema}
          defaultValues={{ name: editing.name }}
          brand={editing}
          onSubmit={(values) => updateMutation.mutateAsync({ id: editing.id, values: values as UpdateBrandInput })}
          onImageChanged={invalidate}
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

// Same "one dialog, category-present-means-edit" shape as
// CategoryFormDialog in app/(dashboard)/categories/page.tsx.
function BrandFormDialog({
  open,
  onOpenChange,
  title,
  schema,
  defaultValues,
  brand,
  onSubmit,
  onImageChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  // Loosely typed: create and update use different (but structurally
  // related) schemas — name required vs optional — matches
  // ResourceFormDialog's own "loosely typed internally, strict at the
  // call site" tradeoff.
  schema: ZodType<FieldValues>;
  defaultValues: BrandFormValues;
  brand?: BrandView;
  onSubmit: (values: BrandFormValues) => Promise<BrandView>;
  onImageChanged: () => void;
}) {
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  // Cast: zodResolver's generic doesn't forward cleanly through a
  // schema-agnostic FieldValues form (same friction as
  // components/resource/resource-form-dialog.tsx).
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema as never),
    defaultValues: defaultValues as DefaultValues<FieldValues>,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiClient.upload<BrandView>(`/brands/${brand!.id}/image`, formData);
    },
    onSuccess: () => {
      onImageChanged();
      toast.success("Image uploaded");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => apiClient.delete<BrandView>(`/brands/${brand!.id}/image`),
    onSuccess: () => {
      onImageChanged();
      toast.success("Image removed");
    },
  });

  const handleSubmit = async (values: FieldValues) => {
    try {
      const result = await onSubmit(values as BrandFormValues);
      if (!brand && pendingImageFile) {
        const formData = new FormData();
        formData.append("file", pendingImageFile);
        try {
          await apiClient.upload(`/brands/${result.id}/image`, formData);
          onImageChanged();
        } catch {
          toast.error("Brand created, but the image upload failed — you can retry it from Edit.");
        }
      }
      onOpenChange(false);
      form.reset();
      setPendingImageFile(null);
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
            <Input id="name" placeholder="Acme" {...form.register("name")} />
          </div>

          <div className="space-y-1.5">
            <Label>Image</Label>
            {brand ? (
              <div className="flex items-center gap-2">
                {brand.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
                  <img src={brand.imageUrl} alt="" className="size-12 rounded border object-cover" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded border bg-muted text-muted-foreground">
                    <ImageOff className="size-4" />
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  className="max-w-64"
                  disabled={uploadMutation.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadMutation.mutate(file);
                    event.target.value = "";
                  }}
                />
                {brand.imageUrl && (
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
            ) : (
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => setPendingImageFile(event.target.files?.[0] ?? null)}
              />
            )}
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
