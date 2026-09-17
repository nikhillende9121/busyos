"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import type { ReceiptFormatView } from "@/modules/receipt-format/types/receipt-format.types";
import { ReceiptFormatForm, DEFAULT_SCHEMA, type FormatFormValues } from "../receipt-format-form";

export default function NewReceiptFormatPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (values: FormatFormValues) =>
      superAdminApiClient.post<ReceiptFormatView>("/receipt-formats", {
        name: values.name,
        paperWidth: Number(values.paperWidth),
        isDefault: values.isDefault,
        schema: JSON.parse(values.schemaText),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "receipt-formats"] });
      toast.success("Receipt format created");
      router.push("/super-admin/receipt-formats");
    },
  });

  return (
    <div className="space-y-6">
      <Link
        href="/super-admin/receipt-formats"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to receipt formats
      </Link>

      <div>
        <h1 className="text-2xl font-semibold font-heading">New receipt format</h1>
        <p className="text-muted-foreground">
          Define the sections a POS device prints, then assign it to a tenant, store, or device from the list.
        </p>
      </div>

      <ReceiptFormatForm
        submitLabel="Create format"
        defaultValues={{
          name: "",
          paperWidth: "58",
          isDefault: false,
          schemaText: JSON.stringify(DEFAULT_SCHEMA, null, 2),
        }}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
      />
    </div>
  );
}
