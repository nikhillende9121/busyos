"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoaderButton } from "@/components/ui/loader-button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import { ApiError } from "@/lib/api/client";
import type { ReceiptFormatView } from "@/modules/receipt-format/types/receipt-format.types";
import type { SuperAdminTenantView, TenantWarehouseSummaryView } from "@/modules/super-admin/types/tenant.types";

// POS-device-level assignment isn't offered here, deliberately: Terminal
// (the POS device concept) has no listing/search UI anywhere in the portal
// yet, so there's nothing to pick from. It's still fully functional via a
// direct API call (POST /receipt-formats/{id}/assign with a terminalId) —
// see modules/receipt-format/service/receipt-format.service.ts's assign().
export function AssignFormatDialog({
  open,
  onOpenChange,
  format,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  format: ReceiptFormatView;
  onAssigned: () => void;
}) {
  const [scope, setScope] = useState<"TENANT" | "WAREHOUSE">("TENANT");
  const [tenantId, setTenantId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");

  const { data: tenants } = useQuery({
    queryKey: ["super-admin", "tenants"],
    queryFn: () => superAdminApiClient.get<SuperAdminTenantView[]>("/tenants"),
    enabled: open,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["super-admin", "tenants", tenantId, "warehouses"],
    queryFn: () => superAdminApiClient.get<TenantWarehouseSummaryView[]>(`/tenants/${tenantId}/warehouses`),
    enabled: open && scope === "WAREHOUSE" && Boolean(tenantId),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      superAdminApiClient.post(`/receipt-formats/${format.id}/assign`, {
        tenantId: scope === "TENANT" ? tenantId : undefined,
        warehouseId: scope === "WAREHOUSE" ? warehouseId : undefined,
      }),
    onSuccess: () => {
      onAssigned();
      toast.success("Receipt format assigned");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    },
  });

  const canSubmit = scope === "TENANT" ? Boolean(tenantId) : Boolean(tenantId) && Boolean(warehouseId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign &quot;{format.name}&quot;</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Tabs value={scope} onValueChange={(value) => value && setScope(value as "TENANT" | "WAREHOUSE")}>
            <TabsList>
              <TabsTrigger value="TENANT">Whole tenant</TabsTrigger>
              <TabsTrigger value="WAREHOUSE">One store</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-1.5">
            <Label>Tenant</Label>
            <Select
              value={tenantId}
              onValueChange={(value) => {
                setTenantId(value ?? "");
                setWarehouseId("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a tenant" />
              </SelectTrigger>
              <SelectContent>
                {(tenants ?? []).map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {scope === "WAREHOUSE" && (
            <div className="space-y-1.5">
              <Label>Store</Label>
              <Select value={warehouseId} onValueChange={(value) => setWarehouseId(value ?? "")} disabled={!tenantId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tenantId ? "Select a store" : "Select a tenant first"} />
                </SelectTrigger>
                <SelectContent>
                  {(warehouses ?? []).map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoaderButton
            type="button"
            loading={assignMutation.isPending}
            disabled={!canSubmit}
            onClick={() => assignMutation.mutate()}
          >
            Assign
          </LoaderButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
