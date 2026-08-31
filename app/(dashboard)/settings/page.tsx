"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import { INDIAN_STATE_OPTIONS } from "@/lib/constants/indian-states";
import {
  updateTenantSettingsSchema,
  type UpdateTenantSettingsInput,
} from "@/modules/tenant/schema/tenant.schema";
import type { TenantProfile, TenantSubscriptionView } from "@/modules/tenant/types/tenant.types";
import type { TaxRateView } from "@/modules/tax-rate/types/tax-rate.types";

const UNSET_TAX_RATE = "__unset__";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const { data: tenant, isLoading } = useQuery({
    queryKey: queryKeys.detail("tenants", "me"),
    queryFn: () => apiClient.get<TenantProfile>("/tenants/me"),
  });
  const { data: taxRates } = useQuery({
    queryKey: queryKeys.list("tax-rates"),
    queryFn: () => apiClient.get<TaxRateView[]>("/tax-rates"),
  });
  const { data: subscription, isLoading: isSubscriptionLoading } = useQuery({
    queryKey: queryKeys.detail("tenants", "me-subscription"),
    queryFn: () => apiClient.get<TenantSubscriptionView | null>("/tenants/me/subscription"),
  });

  const form = useForm<UpdateTenantSettingsInput>({
    resolver: zodResolver(updateTenantSettingsSchema as never),
    defaultValues: {},
  });

  useEffect(() => {
    if (tenant?.settings) {
      form.reset({
        companyName: tenant.settings.companyName ?? "",
        gstNumber: tenant.settings.gstNumber ?? "",
        currency: tenant.settings.currency,
        timezone: tenant.settings.timezone,
        invoicePrefix: tenant.settings.invoicePrefix ?? "",
        decimalPrecision: tenant.settings.decimalPrecision,
        homeState: tenant.settings.homeState ?? "",
        taxInclusivePricing: tenant.settings.taxInclusivePricing,
        defaultTaxRateId: tenant.settings.defaultTaxRateId ?? undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  const updateMutation = useMutation({
    mutationFn: (values: UpdateTenantSettingsInput) => apiClient.put<TenantProfile>("/tenants/me/settings", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.detail("tenants", "me") });
      toast.success("Settings updated");
    },
  });

  const onSubmit = async (values: UpdateTenantSettingsInput) => {
    try {
      const payload: UpdateTenantSettingsInput = {
        ...values,
        defaultTaxRateId: values.defaultTaxRateId === UNSET_TAX_RATE ? null : values.defaultTaxRateId,
      };
      await updateMutation.mutateAsync(payload);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  };

  if (isLoading || !tenant) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const canEdit = can("TENANT.UPDATE_SETTINGS");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold font-heading">{tenant.name}</h1>
          <p className="text-muted-foreground">Tenant code: {tenant.code}</p>
        </div>
        <Badge>{tenant.status}</Badge>
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>Company profile and formatting defaults for this tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company name</Label>
                <Input id="companyName" disabled={!canEdit} {...form.register("companyName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gstNumber">GST number</Label>
                <Input id="gstNumber" disabled={!canEdit} {...form.register("gstNumber")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="currency">Currency (ISO 4217)</Label>
                  <Input id="currency" disabled={!canEdit} placeholder="INR" {...form.register("currency")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" disabled={!canEdit} placeholder="Asia/Kolkata" {...form.register("timezone")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invoicePrefix">Invoice prefix</Label>
                  <Input id="invoicePrefix" disabled={!canEdit} {...form.register("invoicePrefix")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="decimalPrecision">Decimal precision</Label>
                  <Input
                    id="decimalPrecision"
                    type="number"
                    disabled={!canEdit}
                    {...form.register("decimalPrecision", { valueAsNumber: true })}
                  />
                </div>
              </div>
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h3 className="font-heading text-sm font-medium">Taxation (GST)</h3>
                  <p className="text-xs text-muted-foreground">
                    Used to decide CGST+SGST (same state) vs IGST (different state) — see Tax Rates.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Home state</Label>
                    <Controller
                      control={form.control}
                      name="homeState"
                      render={({ field }) => (
                        <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={!canEdit}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Not set" />
                          </SelectTrigger>
                          <SelectContent>
                            {INDIAN_STATE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Default tax rate</Label>
                    <Controller
                      control={form.control}
                      name="defaultTaxRateId"
                      render={({ field }) => (
                        <Select
                          value={field.value ?? UNSET_TAX_RATE}
                          onValueChange={field.onChange}
                          disabled={!canEdit}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNSET_TAX_RATE}>None</SelectItem>
                            {(taxRates ?? []).map((rate) => (
                              <SelectItem key={rate.id} value={rate.id}>
                                {rate.name} ({rate.ratePercent}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                <Controller
                  control={form.control}
                  name="taxInclusivePricing"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="taxInclusivePricing"
                        checked={Boolean(field.value)}
                        onCheckedChange={field.onChange}
                        disabled={!canEdit}
                      />
                      <Label htmlFor="taxInclusivePricing" className="font-normal">
                        Prices already include tax (tax-inclusive pricing)
                      </Label>
                    </div>
                  )}
                />
              </div>
              {canEdit && (
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving…" : "Save settings"}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>
              Your current contract — managed by the platform, not editable here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSubscriptionLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : !subscription ? (
              <p className="text-muted-foreground">No active subscription on record.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-heading text-lg font-semibold">{subscription.plan.name}</p>
                    <p className="text-sm text-muted-foreground">
                      ₹{Number(subscription.priceAtSigning).toLocaleString(undefined, { minimumFractionDigits: 2 })} /{" "}
                      {subscription.plan.billingCycle === "YEARLY" ? "year" : "month"}
                    </p>
                  </div>
                  <Badge variant={subscription.isExpiredByDate ? "destructive" : "default"}>
                    {subscription.isExpiredByDate
                      ? `Expired ${Math.abs(subscription.daysRemaining)} day${Math.abs(subscription.daysRemaining) === 1 ? "" : "s"} ago`
                      : `Renews in ${subscription.daysRemaining} day${subscription.daysRemaining === 1 ? "" : "s"}`}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Contract start</p>
                    <p>{new Date(subscription.startDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Contract end</p>
                    <p>{new Date(subscription.endDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Warehouses</p>
                    <p>{subscription.plan.maxWarehouses ?? "Unlimited"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Users</p>
                    <p>{subscription.plan.maxUsers ?? "Unlimited"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Roles</p>
                    <p>{subscription.plan.maxRoles ?? "Unlimited"}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-sm text-muted-foreground">Included features</p>
                  {subscription.features.length === 0 ? (
                    <p className="text-sm text-muted-foreground">—</p>
                  ) : (
                    <ul className="grid list-disc grid-cols-1 gap-x-6 gap-y-1 pl-4 text-sm sm:grid-cols-2">
                      {subscription.features.map((feature) => (
                        <li key={feature.code}>{feature.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
