"use client";

import { useEffect } from "react";
import { useForm, Controller, type FieldValues, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ZodType } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectPicker } from "@/components/resource/multi-select-picker";
import { ApiError } from "@/lib/api/client";

// One generic create/edit form, reused by every module — a field config
// array plus the module's own existing zod schema (imported straight from
// modules/<name>/schema/*.schema.ts) is all a new resource needs. Client
// and server validation therefore share one schema, not two.
export type ResourceFormFieldType = "text" | "number" | "textarea" | "select" | "checkbox" | "multiselect";

export type ResourceFormField = {
  name: string;
  label: string;
  type?: ResourceFormFieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  description?: string;
};

type ResourceFormDialogProps<TInput extends FieldValues> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  schema: ZodType<TInput>;
  fields: ResourceFormField[];
  defaultValues: DefaultValues<TInput>;
  onSubmit: (values: TInput) => Promise<void>;
  submitLabel?: string;
};

export function ResourceFormDialog<TInput extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  fields,
  defaultValues,
  onSubmit,
  submitLabel = "Save",
}: ResourceFormDialogProps<TInput>) {
  // react-hook-form's Resolver type doesn't forward a generic ZodType<TInput>
  // parameter cleanly (a well-known friction point using zodResolver inside
  // a reusable, schema-agnostic wrapper like this one) — the form is kept
  // loosely typed as FieldValues internally, with the strict TInput only
  // enforced at the public prop boundary above (schema/defaultValues/onSubmit),
  // which is where callers actually get type safety.
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema as never),
    defaultValues: defaultValues as DefaultValues<FieldValues>,
  });

  // Re-seed the form whenever the dialog is (re)opened for a different row
  // — react-hook-form doesn't pick up a changed `defaultValues` prop on its
  // own once mounted.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues as DefaultValues<FieldValues>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValues]);

  const handleSubmit = async (values: FieldValues) => {
    try {
      await onSubmit(values as TInput);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {fields.map((fieldConfig) => (
            <div key={fieldConfig.name} className="space-y-1.5">
              {fieldConfig.type !== "checkbox" && <Label htmlFor={fieldConfig.name}>{fieldConfig.label}</Label>}

              {fieldConfig.type === "select" ? (
                <Controller
                  control={form.control}
                  name={fieldConfig.name as never}
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger id={fieldConfig.name} className="w-full">
                        <SelectValue placeholder={fieldConfig.placeholder ?? "Select…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldConfig.options?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : fieldConfig.type === "multiselect" ? (
                <Controller
                  control={form.control}
                  name={fieldConfig.name as never}
                  render={({ field }) => (
                    <MultiSelectPicker
                      options={fieldConfig.options ?? []}
                      value={field.value ?? []}
                      onChange={field.onChange}
                      placeholder={fieldConfig.placeholder ?? "Select…"}
                    />
                  )}
                />
              ) : fieldConfig.type === "checkbox" ? (
                <Controller
                  control={form.control}
                  name={fieldConfig.name as never}
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={fieldConfig.name}
                        checked={Boolean(field.value)}
                        onCheckedChange={field.onChange}
                      />
                      <Label htmlFor={fieldConfig.name} className="font-normal">
                        {fieldConfig.label}
                      </Label>
                    </div>
                  )}
                />
              ) : fieldConfig.type === "textarea" ? (
                <Textarea
                  id={fieldConfig.name}
                  placeholder={fieldConfig.placeholder}
                  {...form.register(fieldConfig.name as never)}
                />
              ) : (
                <Input
                  id={fieldConfig.name}
                  type={fieldConfig.type === "number" ? "number" : "text"}
                  placeholder={fieldConfig.placeholder}
                  {...form.register(
                    fieldConfig.name as never,
                    fieldConfig.type === "number" ? { valueAsNumber: true } : undefined,
                  )}
                />
              )}

              {fieldConfig.description && (
                <p className="text-xs text-muted-foreground">{fieldConfig.description}</p>
              )}
              {form.formState.errors[fieldConfig.name] && (
                <p className="text-sm text-destructive">
                  {String(form.formState.errors[fieldConfig.name]?.message ?? "Invalid value")}
                </p>
              )}
            </div>
          ))}

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
