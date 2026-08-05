"use client";

import type { ReactNode } from "react";
import { useFieldArray, Controller, type Control, type FieldValues, type ArrayPath } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

// Shared by every module whose create form has a nested { productId, ... }[]
// array — stock transfers, stock adjustments, purchases, sales — instead of
// each re-implementing useFieldArray wiring. Needs the parent form's
// `control` directly (unlike the flat-field ResourceFormDialog, which owns
// its own internal form), so it's used inside bespoke create dialogs, not
// through that generic component.
export type LineItemColumn = {
  name: string;
  label: string;
  type?: "text" | "number";
  placeholder?: string;
};

type LineItemsFieldProps = {
  control: Control<FieldValues>;
  name: string;
  productOptions: { label: string; value: string }[];
  columns: LineItemColumn[];
  emptyItem: Record<string, unknown>;
  /** Optional per-row helper text under the product picker — e.g. stock
   * transfers show the source warehouse's available quantity so the caller
   * doesn't have to guess before typing a transfer quantity. */
  productHint?: (productId: string) => ReactNode;
};

export function LineItemsField({ control, name, productOptions, columns, emptyItem, productHint }: LineItemsFieldProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: name as ArrayPath<FieldValues>,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Line items</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => append(emptyItem)}>
          <Plus className="size-4" /> Add line
        </Button>
      </div>

      {fields.length === 0 && <p className="text-sm text-muted-foreground">No lines yet — add at least one.</p>}

      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
            <div className="min-w-40 flex-1 space-y-1">
              <Label className="text-xs">Product</Label>
              <Controller
                control={control}
                name={`${name}.${index}.productId` as never}
                render={({ field: productField }) => (
                  <>
                    <Select value={productField.value ?? ""} onValueChange={productField.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {productOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {productHint && productField.value && (
                      <p className="text-xs text-muted-foreground">{productHint(productField.value)}</p>
                    )}
                  </>
                )}
              />
            </div>
            {columns.map((column) => (
              <div key={column.name} className="w-28 space-y-1">
                <Label className="text-xs">{column.label}</Label>
                <Controller
                  control={control}
                  name={`${name}.${index}.${column.name}` as never}
                  render={({ field: columnField }) => (
                    <Input
                      type={column.type ?? "text"}
                      placeholder={column.placeholder}
                      value={columnField.value ?? ""}
                      onChange={(event) => columnField.onChange(event.target.value)}
                    />
                  )}
                />
              </div>
            ))}
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(index)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
