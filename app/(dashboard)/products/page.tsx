"use client";

import { useState } from "react";
import { useForm, Controller, type Control, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ZodType } from "zod";
import { Plus, Pencil, Trash2, ImageOff, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { DateRangeFilter, type DateRange } from "@/components/resource/date-range-filter";
import { ExportButton } from "@/components/resource/export-button";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { createProductSchema, updateProductSchema } from "@/modules/product/schema/product.schema";
import type { ProductView } from "@/modules/product/types/product.types";
import type { Paginated } from "@/shared/utils/pagination";
import type { CategoryView } from "@/modules/product/types/category.types";
import type { BrandView } from "@/modules/product/types/brand.types";
import type { UnitView } from "@/modules/product/types/unit.types";
import type { TaxRateView } from "@/modules/tax-rate/types/tax-rate.types";

// Unlike the flat-list modules (Warehouses, Categories, ...), Products is
// paginated and has three relation pickers (category/brand/unit) — enough
// difference from ResourceCrudPage's contract that this stays a
// standalone page. Hand-rolled (not ResourceFormDialog) specifically so
// the image gallery can live inside this same create/edit form, same
// reasoning as Categories/Brands.
const STATUS_OPTIONS = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Discontinued", value: "DISCONTINUED" },
];

type Option = { label: string; value: string };

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ProductView | null>(null);
  const [deleting, setDeleting] = useState<ProductView | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.list("products", { page, ...dateRange }),
    queryFn: () => apiClient.get<Paginated<ProductView>>("/products", { page, pageSize: 20, ...dateRange }),
  });

  const { data: categories } = useQuery({
    queryKey: queryKeys.list("categories"),
    queryFn: () => apiClient.get<CategoryView[]>("/categories"),
  });
  const { data: brands } = useQuery({
    queryKey: queryKeys.list("brands"),
    queryFn: () => apiClient.get<BrandView[]>("/brands"),
  });
  const { data: units } = useQuery({
    queryKey: queryKeys.list("units"),
    queryFn: () => apiClient.get<UnitView[]>("/units"),
  });
  const { data: taxRates } = useQuery({
    queryKey: queryKeys.list("tax-rates"),
    queryFn: () => apiClient.get<TaxRateView[]>("/tax-rates"),
  });

  const categoryName = (id: string | null) => categories?.find((c) => c.id === id)?.name ?? "—";
  const brandName = (id: string | null) => brands?.find((b) => b.id === id)?.name ?? "—";
  const unitName = (id: string | null) => units?.find((u) => u.id === id)?.name ?? "—";
  const taxRateName = (id: string | null) => {
    const rate = taxRates?.find((r) => r.id === id);
    return rate ? `${rate.name} (${rate.ratePercent}%)` : "—";
  };

  const categoryOptions = (categories ?? []).map((c) => ({ label: c.name, value: c.id }));
  const brandOptions = (brands ?? []).map((b) => ({ label: b.name, value: b.id }));
  const unitOptions = (units ?? []).map((u) => ({ label: u.name, value: u.id }));
  const taxRateOptions = (taxRates ?? []).map((r) => ({ label: `${r.name} (${r.ratePercent}%)`, value: r.id }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.list("products") });

  const createMutation = useMutation({
    mutationFn: (values: FieldValues) => apiClient.post<ProductView>("/products", values),
    onSuccess: () => {
      invalidate();
      toast.success("Product created");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: FieldValues }) =>
      apiClient.put<ProductView>(`/products/${id}`, values),
    onSuccess: () => {
      invalidate();
      toast.success("Product updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/products/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Product deleted");
    },
  });

  const columns: DataTableColumn<ProductView>[] = [
    {
      key: "thumbnail",
      header: "",
      render: (row) =>
        row.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset
          <img src={row.images[0].thumbnailUrl} alt="" className="size-10 rounded object-cover" />
        ) : (
          <div className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
            <ImageOff className="size-4" />
          </div>
        ),
    },
    { key: "sku", header: "SKU" },
    { key: "name", header: "Name" },
    { key: "category", header: "Category", render: (row) => categoryName(row.categoryId) },
    { key: "brand", header: "Brand", render: (row) => brandName(row.brandId) },
    { key: "unit", header: "Unit", render: (row) => unitName(row.unitId) },
    { key: "taxRate", header: "Tax rate", render: (row) => taxRateName(row.taxRateId) },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>{row.status}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Products</h1>
          <p className="text-muted-foreground">Your product catalog.</p>
        </div>
        {can("PRODUCT.CREATE") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New product
          </Button>
        )}
      </div>

      <div className="flex items-end justify-between gap-3">
        <DateRangeFilter
          value={dateRange}
          onChange={(next) => {
            setDateRange(next);
            setPage(1);
          }}
        />
        <ExportButton resource="products" params={dateRange} />
      </div>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        pagination={data?.pagination}
        onPageChange={setPage}
        emptyMessage="No products yet."
        actions={(row) => (
          <div className="flex justify-end gap-2">
            {can("PRODUCT.UPDATE") && (
              <Button variant="ghost" size="icon-sm" onClick={() => setEditing(row)}>
                <Pencil className="size-4" />
              </Button>
            )}
            {can("PRODUCT.DELETE") && (
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(row)}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        )}
      />

      {createOpen && (
        <ProductFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="New product"
          schema={createProductSchema}
          defaultValues={{
            sku: "",
            name: "",
            barcode: "",
            categoryId: undefined,
            brandId: undefined,
            unitId: undefined,
            taxRateId: undefined,
            status: "ACTIVE",
          }}
          categoryOptions={categoryOptions}
          brandOptions={brandOptions}
          unitOptions={unitOptions}
          taxRateOptions={taxRateOptions}
          onSubmit={(values) => createMutation.mutateAsync(values)}
          onImagesChanged={invalidate}
        />
      )}

      {editing && (
        <ProductFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          title={`Edit ${editing.name}`}
          schema={updateProductSchema}
          defaultValues={{
            sku: editing.sku,
            name: editing.name,
            barcode: editing.barcode ?? "",
            categoryId: editing.categoryId ?? undefined,
            brandId: editing.brandId ?? undefined,
            unitId: editing.unitId ?? undefined,
            taxRateId: editing.taxRateId ?? undefined,
            status: editing.status,
          }}
          product={editing}
          categoryOptions={categoryOptions}
          brandOptions={brandOptions}
          unitOptions={unitOptions}
          taxRateOptions={taxRateOptions}
          onSubmit={(values) => updateMutation.mutateAsync({ id: editing.id, values })}
          onImagesChanged={invalidate}
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

// One dialog for both create and edit — `product` present means edit
// (the gallery uploads/deletes/reorders immediately against its id, same
// as the old separate ProductImagesDialog used to); absent means create
// (picked files are stashed and uploaded as a follow-up call once the
// product exists, same "create first, then upload" pattern as
// CategoryFormDialog/BrandFormDialog and the Super Admin tenant logo).
function ProductFormDialog({
  open,
  onOpenChange,
  title,
  schema,
  defaultValues,
  product,
  categoryOptions,
  brandOptions,
  unitOptions,
  taxRateOptions,
  onSubmit,
  onImagesChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  schema: ZodType<FieldValues>;
  defaultValues: FieldValues;
  product?: ProductView;
  categoryOptions: Option[];
  brandOptions: Option[];
  unitOptions: Option[];
  taxRateOptions: Option[];
  onSubmit: (values: FieldValues) => Promise<ProductView>;
  onImagesChanged: () => void;
}) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  // Cast: zodResolver's generic doesn't forward cleanly through a
  // schema-agnostic FieldValues form (same friction noted previously when
  // this page used ResourceFormDialog).
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema as never),
    defaultValues,
  });

  // Edit mode reads its own live copy of the product (keyed by id) so the
  // gallery reflects each upload/delete/make-primary immediately, instead
  // of the (possibly stale) row snapshot the dialog was opened with.
  const { data: liveProduct } = useQuery({
    queryKey: queryKeys.detail("products", product?.id ?? ""),
    queryFn: () => apiClient.get<ProductView>(`/products/${product!.id}`),
    enabled: Boolean(product),
  });
  const images = (liveProduct ?? product)?.images ?? [];

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      return apiClient.upload(`/products/${product!.id}/images`, formData);
    },
    onSuccess: () => {
      onImagesChanged();
      toast.success("Images uploaded");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => apiClient.delete<void>(`/products/${product!.id}/images/${imageId}`),
    onSuccess: () => {
      onImagesChanged();
      toast.success("Image deleted");
    },
  });

  const makePrimaryMutation = useMutation({
    mutationFn: (imageId: string) => apiClient.patch<void>(`/products/${product!.id}/images/${imageId}`, {}),
    onSuccess: () => onImagesChanged(),
  });

  const handleSubmit = async (values: FieldValues) => {
    try {
      const result = await onSubmit(values);
      if (!product && pendingFiles.length > 0) {
        const formData = new FormData();
        pendingFiles.forEach((file) => formData.append("files", file));
        try {
          await apiClient.upload(`/products/${result.id}/images`, formData);
          onImagesChanged();
        } catch {
          toast.error("Product created, but the image upload failed — you can retry it from Edit.");
        }
      }
      onOpenChange(false);
      form.reset();
      setPendingFiles([]);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" placeholder="RICE-5KG" {...form.register("sku")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Basmati Rice 5kg" {...form.register("name")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="barcode">Barcode</Label>
            <Input id="barcode" placeholder="optional" {...form.register("barcode")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Category"
              name="categoryId"
              control={form.control}
              options={categoryOptions}
              placeholder="No category"
            />
            <SelectField
              label="Brand"
              name="brandId"
              control={form.control}
              options={brandOptions}
              placeholder="No brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Unit" name="unitId" control={form.control} options={unitOptions} placeholder="No unit" />
            <SelectField
              label="Tax rate"
              name="taxRateId"
              control={form.control}
              options={taxRateOptions}
              placeholder="Use tenant default"
            />
          </div>

          <SelectField label="Status" name="status" control={form.control} options={STATUS_OPTIONS} placeholder="Active" />

          <div className="space-y-1.5">
            <Label>Images</Label>
            {product ? (
              <div className="space-y-3">
                {images.length > 0 && (
                  <div className="grid grid-cols-4 gap-3">
                    {images.map((image, index) => (
                      <div key={image.id} className="group relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- external Cloudinary URL, not a local/static asset */}
                        <img
                          src={image.thumbnailUrl}
                          alt=""
                          className="aspect-square w-full rounded border object-cover"
                        />
                        <button
                          type="button"
                          className="absolute top-1 right-1 rounded-full bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-50"
                          disabled={deleteImageMutation.isPending || makePrimaryMutation.isPending}
                          onClick={() => deleteImageMutation.mutate(image.id)}
                          aria-label="Delete image"
                        >
                          <X className="size-3" />
                        </button>
                        {index === 0 ? (
                          <Badge className="absolute bottom-1 left-1 gap-1 px-1.5 py-0 text-[10px]">
                            <Star className="size-2.5" /> Primary
                          </Badge>
                        ) : (
                          <button
                            type="button"
                            className="absolute bottom-1 left-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-50"
                            disabled={deleteImageMutation.isPending || makePrimaryMutation.isPending}
                            onClick={() => makePrimaryMutation.mutate(image.id)}
                          >
                            {makePrimaryMutation.isPending && makePrimaryMutation.variables === image.id
                              ? "Working…"
                              : "Make primary"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadMutation.isPending}
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files && files.length > 0) uploadMutation.mutate(Array.from(files));
                    event.target.value = "";
                  }}
                  className="text-sm"
                />
              </div>
            ) : (
              <div className="space-y-2">
                {pendingFiles.length > 0 && (
                  <ul className="space-y-1">
                    {pendingFiles.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between rounded border px-2 py-1 text-sm"
                      >
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                          aria-label="Remove"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const files = event.target.files;
                    if (files && files.length > 0) setPendingFiles((prev) => [...prev, ...Array.from(files)]);
                    event.target.value = "";
                  }}
                  className="text-sm"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Up to 8 images per product, 5MB each.</p>
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

function SelectField({
  label,
  name,
  control,
  options,
  placeholder,
}: {
  label: string;
  name: string;
  control: Control<FieldValues>;
  options: Option[];
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}
