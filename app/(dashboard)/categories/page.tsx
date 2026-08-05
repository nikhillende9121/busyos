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
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from "@/modules/product/schema/category.schema";
import type { CategoryView } from "@/modules/product/types/category.types";

type CategoryFormValues = { name: string; parentId?: string };

// Standalone (not ResourceCrudPage) so the image upload can live inside
// this same create/edit form — ResourceFormDialog's fields[] is
// schema-validated-JSON only, and image upload is a separate multipart
// endpoint. See app/(dashboard)/products/page.tsx for the same reasoning
// and the "create first, then upload" pattern this mirrors.
export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryView | null>(null);
  const [deleting, setDeleting] = useState<CategoryView | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: queryKeys.list("categories"),
    queryFn: () => apiClient.get<CategoryView[]>("/categories"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.list("categories") });

  const createMutation = useMutation({
    mutationFn: (values: CreateCategoryInput) => apiClient.post<CategoryView>("/categories", values),
    onSuccess: () => {
      invalidate();
      toast.success("Category created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateCategoryInput }) =>
      apiClient.put<CategoryView>(`/categories/${id}`, values),
    onSuccess: () => {
      invalidate();
      toast.success("Category updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/categories/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Category deleted");
    },
  });

  const columns: DataTableColumn<CategoryView>[] = [
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
    { key: "parentId", header: "Parent ID", render: (row) => row.parentId ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Categories</h1>
          <p className="text-muted-foreground">Product categories, optionally nested under a parent category.</p>
        </div>
        {can("CATEGORY.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New category
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={categories ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No categories yet."
        actions={(row) => (
          <div className="flex justify-end gap-2">
            {can("CATEGORY.UPDATE") && (
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(row)}>
                <Pencil className="size-4" />
              </Button>
            )}
            {can("CATEGORY.DELETE") && (
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(row)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        )}
      />

      {createOpen && (
        <CategoryFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="New category"
          schema={createCategorySchema}
          defaultValues={{ name: "", parentId: undefined }}
          onSubmit={(values) => createMutation.mutateAsync(values as CreateCategoryInput)}
          onImageChanged={invalidate}
        />
      )}

      {editing && (
        <CategoryFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          title={`Edit ${editing.name}`}
          schema={updateCategorySchema}
          defaultValues={{ name: editing.name, parentId: editing.parentId ?? undefined }}
          category={editing}
          onSubmit={(values) =>
            updateMutation.mutateAsync({ id: editing.id, values: values as UpdateCategoryInput })
          }
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

// One dialog handles both create and edit — `category` present means edit
// (the image slot uploads/removes immediately against its id); absent
// means create (a picked file is stashed and uploaded as a follow-up call
// once the category exists, same as CreateTenantDialog in
// app/super-admin/(dashboard)/tenants/page.tsx).
function CategoryFormDialog({
  open,
  onOpenChange,
  title,
  schema,
  defaultValues,
  category,
  onSubmit,
  onImageChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  // Loosely typed: create and update use different (but structurally
  // related) schemas — name required vs optional — so this can't be
  // pinned to one shape without either duplicating the component or
  // losing the ability to share it. Matches ResourceFormDialog's own
  // "loosely typed internally, strict at the call site" tradeoff.
  schema: ZodType<FieldValues>;
  defaultValues: CategoryFormValues;
  category?: CategoryView;
  onSubmit: (values: CategoryFormValues) => Promise<CategoryView>;
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
      return apiClient.upload<CategoryView>(`/categories/${category!.id}/image`, formData);
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
    mutationFn: () => apiClient.delete<CategoryView>(`/categories/${category!.id}/image`),
    onSuccess: () => {
      onImageChanged();
      toast.success("Image removed");
    },
  });

  const handleSubmit = async (values: FieldValues) => {
    try {
      const result = await onSubmit(values as CategoryFormValues);
      if (!category && pendingImageFile) {
        const formData = new FormData();
        formData.append("file", pendingImageFile);
        try {
          await apiClient.upload(`/categories/${result.id}/image`, formData);
          onImageChanged();
        } catch {
          toast.error("Category created, but the image upload failed — you can retry it from Edit.");
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
            <Input id="name" placeholder="Grocery" {...form.register("name")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="parentId">Parent category ID</Label>
            <Input id="parentId" placeholder="optional" {...form.register("parentId")} />
            <p className="text-xs text-muted-foreground">
              Numeric ID of a parent category, if this is a sub-category.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Image</Label>
            {category ? (
              <div className="flex items-center gap-2">
                {category.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
                  <img src={category.imageUrl} alt="" className="size-12 rounded border object-cover" />
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
                {category.imageUrl && (
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
