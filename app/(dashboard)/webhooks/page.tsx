"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Copy, RefreshCw, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/resource/confirm-dialog";
import { apiClient, ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-context";
import type {
  WebhookIntegrationView,
  WebhookEndpointView,
  WebhookDeliveryView,
} from "@/modules/webhook/types/webhook.types";
import type { WarehouseView } from "@/modules/warehouse/types/warehouse.types";
import type { Paginated } from "@/shared/utils/pagination";

// Only the event types actually wired up to fire in v1 — see
// Docs/webhooks.md §6 and modules/webhook/service's trigger call sites.
// The schema's WebhookEventType enum is fuller (future-proofing), but
// offering an event that can never fire would just confuse a tenant.
const V1_EVENT_TYPES = [
  { value: "PRODUCT_CREATED", label: "Product created" },
  { value: "PRODUCT_UPDATED", label: "Product updated" },
  { value: "PRODUCT_DELETED", label: "Product deleted" },
  { value: "PRICE_LIST_CREATED", label: "Price list created" },
  { value: "DISCOUNT_CREATED", label: "Discount created" },
  { value: "COUPON_CREATED", label: "Coupon created" },
];

const QUERY_KEYS = {
  integration: ["webhooks", "integration"],
  endpoints: ["webhooks", "endpoints"],
};

function SecretRevealDialog({
  open,
  onOpenChange,
  label,
  secret,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  secret: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Copy this now — it will not be shown again. If you lose it, you&apos;ll need to regenerate a new one.
        </p>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
          <code className="flex-1 overflow-x-auto text-xs">{secret}</code>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              void navigator.clipboard.writeText(secret);
              toast.success("Copied to clipboard");
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WebhooksPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("WEBHOOK.UPDATE") || can("WEBHOOK.CREATE");

  const [revealSecret, setRevealSecret] = useState<{ label: string; secret: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpointView | null>(null);
  const [deliveryLogEndpoint, setDeliveryLogEndpoint] = useState<WebhookEndpointView | null>(null);

  const { data: integration, isLoading: isIntegrationLoading } = useQuery({
    queryKey: QUERY_KEYS.integration,
    queryFn: () => apiClient.get<WebhookIntegrationView | null>("/webhooks/integration"),
  });
  const { data: endpoints, isLoading: isEndpointsLoading } = useQuery({
    queryKey: QUERY_KEYS.endpoints,
    queryFn: () => apiClient.get<WebhookEndpointView[]>("/webhooks"),
    enabled: Boolean(integration),
  });
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses", "list"],
    queryFn: () => apiClient.get<WarehouseView[]>("/warehouses"),
  });

  const invalidateIntegration = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.integration });
  const invalidateEndpoints = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.endpoints });

  const createIntegrationMutation = useMutation({
    mutationFn: () => apiClient.post<WebhookIntegrationView>("/webhooks/integration"),
    onSuccess: (result) => {
      invalidateIntegration();
      setRevealSecret({ label: "Integration secret", secret: result.apiSecret ?? "" });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  const regenerateSecretMutation = useMutation({
    mutationFn: () => apiClient.post<WebhookIntegrationView>("/webhooks/integration/regenerate"),
    onSuccess: (result) => {
      invalidateIntegration();
      setRevealSecret({ label: "New integration secret", secret: result.apiSecret ?? "" });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  const updateIntegrationMutation = useMutation({
    mutationFn: (values: { defaultOnlineWarehouseId?: string; isEnabled?: boolean }) =>
      apiClient.put<WebhookIntegrationView>("/webhooks/integration", values),
    onSuccess: () => {
      invalidateIntegration();
      toast.success("Updated");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  const createEndpointMutation = useMutation({
    mutationFn: (values: { url: string; eventTypes: string[] }) =>
      apiClient.post<WebhookEndpointView>("/webhooks", values),
    onSuccess: (result) => {
      invalidateEndpoints();
      setCreateOpen(false);
      setRevealSecret({ label: "Webhook signing secret", secret: result.signingSecret ?? "" });
      toast.success("Webhook endpoint created");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.put<WebhookEndpointView>(`/webhooks/${id}`, { isActive }),
    onSuccess: () => {
      invalidateEndpoints();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  const deleteEndpointMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/webhooks/${id}`),
    onSuccess: () => {
      invalidateEndpoints();
      toast.success("Webhook endpoint deleted");
    },
  });

  const sendTestMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/webhooks/${id}/test`),
    onSuccess: () => {
      invalidateEndpoints();
      toast.success("Test event sent — check the delivery log for the result");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Something went wrong."),
  });

  if (isIntegrationLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Webhooks</h1>
        <p className="text-muted-foreground">
          Receive orders from your own website, and push catalog, pricing, and discount changes out to it.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Integration credentials</CardTitle>
          <CardDescription>Used by your website to send orders into this platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {!integration ? (
            canEdit ? (
              <Button onClick={() => createIntegrationMutation.mutate()} disabled={createIntegrationMutation.isPending}>
                {createIntegrationMutation.isPending ? "Creating…" : "Create integration credentials"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">No integration credentials yet.</p>
            )
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>API key</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border bg-muted/30 p-2 text-xs">{integration.apiKey}</code>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => regenerateSecretMutation.mutate()}
                      disabled={regenerateSecretMutation.isPending}
                    >
                      <RefreshCw className="size-4" /> Regenerate secret
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Default online warehouse</Label>
                  <Select
                    value={integration.defaultOnlineWarehouseId ?? ""}
                    onValueChange={(value) =>
                      updateIntegrationMutation.mutate({ defaultOnlineWarehouseId: value ?? undefined })
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      {(warehouses ?? []).map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Inbound orders draw stock from this warehouse.</p>
                </div>
                <div className="flex items-end">
                  <Badge variant={integration.isEnabled ? "default" : "secondary"}>
                    {integration.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {integration && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Webhook endpoints</CardTitle>
              <CardDescription>Registered URLs that receive catalog/pricing/discount events.</CardDescription>
            </div>
            {canEdit && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> Add webhook
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Last delivery</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isEndpointsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : !endpoints || endpoints.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No webhooks yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  endpoints.map((endpoint) => (
                    <TableRow key={endpoint.id}>
                      <TableCell className="max-w-xs truncate font-mono text-xs">{endpoint.url}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {endpoint.eventTypes.map((eventType) => (
                            <Badge key={eventType} variant="outline">
                              {eventType}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={endpoint.isActive}
                          disabled={!canEdit}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ id: endpoint.id, isActive: Boolean(checked) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {endpoint.lastDelivery ? (
                          <button
                            type="button"
                            className="hover:underline"
                            onClick={() => setDeliveryLogEndpoint(endpoint)}
                          >
                            <Badge variant={endpoint.lastDelivery.status === "SUCCESS" ? "default" : "destructive"}>
                              {endpoint.lastDelivery.status}
                            </Badge>
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            title="Send test event"
                            onClick={() => sendTestMutation.mutate(endpoint.id)}
                            disabled={sendTestMutation.isPending}
                          >
                            <Send className="size-4" />
                          </Button>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteTarget(endpoint)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {createOpen && (
        <CreateEndpointDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSubmit={(values) => createEndpointMutation.mutateAsync(values)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete this webhook?"
          description="It will stop receiving events immediately. This cannot be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await deleteEndpointMutation.mutateAsync(deleteTarget.id);
          }}
        />
      )}

      {revealSecret && (
        <SecretRevealDialog
          open={Boolean(revealSecret)}
          onOpenChange={(open) => !open && setRevealSecret(null)}
          label={revealSecret.label}
          secret={revealSecret.secret}
        />
      )}

      {deliveryLogEndpoint && (
        <DeliveryLogDialog
          open={Boolean(deliveryLogEndpoint)}
          onOpenChange={(open) => !open && setDeliveryLogEndpoint(null)}
          endpoint={deliveryLogEndpoint}
        />
      )}
    </div>
  );
}

function CreateEndpointDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { url: string; eventTypes: string[] }) => Promise<unknown>;
}) {
  const form = useForm<{ url: string; eventTypes: string[] }>({
    defaultValues: { url: "", eventTypes: [] },
  });

  const handleSubmit = async (values: { url: string; eventTypes: string[] }) => {
    try {
      await onSubmit(values);
      form.reset();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add webhook</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              placeholder="https://your-store.example.com/webhooks/retailx"
              {...form.register("url", { required: true })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Events</Label>
            <Controller
              control={form.control}
              name="eventTypes"
              rules={{ validate: (value) => value.length > 0 || "Select at least one event" }}
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-1.5 rounded-md border p-3">
                  {V1_EVENT_TYPES.map((eventType) => (
                    <label key={eventType.value} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={field.value.includes(eventType.value)}
                        onCheckedChange={(checked) => {
                          field.onChange(
                            checked
                              ? [...field.value, eventType.value]
                              : field.value.filter((v) => v !== eventType.value),
                          );
                        }}
                      />
                      {eventType.label}
                    </label>
                  ))}
                </div>
              )}
            />
            {form.formState.errors.eventTypes && (
              <p className="text-sm text-destructive">{form.formState.errors.eventTypes.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating…" : "Create webhook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryLogDialog({
  open,
  onOpenChange,
  endpoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: WebhookEndpointView;
}) {
  const { data } = useQuery({
    queryKey: ["webhooks", "deliveries", endpoint.id],
    queryFn: () => apiClient.get<Paginated<WebhookDeliveryView>>(`/webhooks/${endpoint.id}/deliveries`, { page: 1, pageSize: 20 }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery log</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>HTTP</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data || data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No deliveries yet.
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell>{delivery.eventType}</TableCell>
                  <TableCell>
                    <Badge variant={delivery.status === "SUCCESS" ? "default" : "destructive"}>
                      {delivery.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{delivery.httpStatusCode ?? "—"}</TableCell>
                  <TableCell>{delivery.attemptCount}</TableCell>
                  <TableCell>{new Date(delivery.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
