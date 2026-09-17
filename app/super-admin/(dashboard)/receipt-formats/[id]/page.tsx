"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import type { ReceiptFormatView } from "@/modules/receipt-format/types/receipt-format.types";
import { ReceiptFormatForm, type FormatFormValues } from "../receipt-format-form";
import { AssignFormatDialog } from "../assign-format-dialog";

export default function EditReceiptFormatPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [assigning, setAssigning] = useState(false);

  const { data: format, isLoading } = useQuery({
    queryKey: ["super-admin", "receipt-formats", id],
    queryFn: () => superAdminApiClient.get<ReceiptFormatView>(`/receipt-formats/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (values: FormatFormValues) =>
      superAdminApiClient.put<ReceiptFormatView>(`/receipt-formats/${id}`, {
        name: values.name,
        paperWidth: Number(values.paperWidth),
        isDefault: values.isDefault,
        schema: JSON.parse(values.schemaText),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "receipt-formats"] });
      toast.success("Receipt format updated");
      router.push("/super-admin/receipt-formats");
    },
  });

  if (isLoading || !format) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/super-admin/receipt-formats"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to receipt formats
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Edit {format.name}</h1>
          <p className="text-muted-foreground">Saving bumps the version, so assigned POS devices pick up the change.</p>
        </div>
        <Button variant="outline" onClick={() => setAssigning(true)}>
          <Share2 className="size-4" /> Assign to tenant / store
        </Button>
      </div>

      {format.assignments.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Currently assigned to: {format.assignments.map((a) => a.scope).join(", ")}
        </p>
      )}

      <ReceiptFormatForm
        submitLabel="Save changes"
        defaultValues={{
          name: format.name,
          paperWidth: format.paperWidth.toString(),
          isDefault: format.isDefault,
          schemaText: JSON.stringify(format.schema, null, 2),
        }}
        onSubmit={async (values) => {
          await updateMutation.mutateAsync(values);
        }}
      />

      {assigning && (
        <AssignFormatDialog
          open={assigning}
          onOpenChange={setAssigning}
          format={format}
          onAssigned={() => queryClient.invalidateQueries({ queryKey: ["super-admin", "receipt-formats"] })}
        />
      )}
    </div>
  );
}
