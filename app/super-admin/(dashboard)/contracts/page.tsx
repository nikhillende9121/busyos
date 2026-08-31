"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { superAdminApiClient } from "@/lib/api/super-admin-client";
import type { ContractWithTenantView } from "@/modules/super-admin/types/subscription.types";

const EXPIRING_SOON_THRESHOLD_DAYS = 14;

const money = (value: string) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2 });

function StatusCell({ contract }: { contract: ContractWithTenantView }) {
  if (contract.isExpiredByDate) {
    return <Badge variant="secondary">Expired</Badge>;
  }
  if (contract.status === "CANCELLED") {
    return <Badge variant="outline">Cancelled</Badge>;
  }
  if (contract.isCurrentlyActive && contract.daysRemaining <= EXPIRING_SOON_THRESHOLD_DAYS) {
    return <Badge variant="destructive">Expires in {contract.daysRemaining}d</Badge>;
  }
  return <Badge>{contract.status}</Badge>;
}

// Platform-wide, read-only — spotting what's active/expiring across every
// tenant at a glance. Creating/cancelling a contract still only happens
// from its tenant's own dialog on the Tenants page (see
// app/super-admin/(dashboard)/tenants/page.tsx's TenantContractDialog) —
// this page deliberately doesn't duplicate that action.
export default function SuperAdminContractsPage() {
  const { data: contracts, isLoading } = useQuery({
    queryKey: ["super-admin", "subscriptions"],
    queryFn: () => superAdminApiClient.get<ContractWithTenantView[]>("/subscriptions"),
  });

  const columns: DataTableColumn<ContractWithTenantView>[] = [
    {
      key: "tenant",
      header: "Tenant",
      render: (row) => (
        <Link href="/super-admin/tenants" className="hover:underline">
          {row.tenantName}
        </Link>
      ),
    },
    { key: "plan", header: "Plan", render: (row) => row.planName },
    { key: "price", header: "Price", render: (row) => money(row.priceAtSigning) },
    { key: "start", header: "Start", render: (row) => new Date(row.startDate).toLocaleDateString() },
    { key: "end", header: "End", render: (row) => new Date(row.endDate).toLocaleDateString() },
    { key: "status", header: "Status", render: (row) => <StatusCell contract={row} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading">Contracts</h1>
        <p className="text-muted-foreground">
          Every subscription contract across every tenant, active ones first — soonest-expiring at the top.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={contracts ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.id}
        emptyMessage="No contracts yet."
      />
    </div>
  );
}
