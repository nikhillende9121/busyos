"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, History, Wallet, Settings2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoaderButton } from "@/components/ui/loader-button";
import { DataTable, type DataTableColumn } from "@/components/resource/data-table";
import { apiClient, ApiError } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import { useAuth } from "@/lib/auth/auth-context";
import type { CreditReportRowView, CreditTransactionView } from "@/modules/credit/types/credit.types";
import type { CustomerView } from "@/modules/customer/types/customer.types";
import type { Paginated } from "@/shared/utils/pagination";

const TRANSACTION_TYPE_LABELS: Record<CreditTransactionView["type"], string> = {
  OPENING: "Opening Balance",
  SALE_CHARGE: "Sale",
  PAYMENT: "Payment",
  CREDIT_NOTE: "Credit Note",
  ADJUSTMENT: "Adjustment",
};

const PAYMENT_METHOD_OPTIONS = [
  { label: "Cash", value: "CASH" },
  { label: "Card", value: "CARD" },
  { label: "Bank Transfer", value: "BANK_TRANSFER" },
  { label: "UPI", value: "UPI" },
  { label: "Cheque", value: "CHEQUE" },
];

function formatAmount(value: string): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Settlement day is stored/sent as a plain day-of-month integer (1-28 —
// capped so it's valid every month, see modules/credit/schema/credit.schema.ts),
// but picked in the UI via a native date input for a real calendar
// experience — the month/year picked are discarded, only the day matters,
// so an arbitrary (but stable) current-month date is synthesized just to
// give the picker something to display.
function settlementDayToDateInputValue(settlementDay: string): string {
  if (!settlementDay) return "";
  const now = new Date();
  const day = Math.min(Number(settlementDay), 28);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateInputValueToSettlementDay(dateValue: string): string {
  if (!dateValue) return "";
  const day = Number(dateValue.split("-")[2]);
  // Clamped, not rejected — a customer picking the 30th/31st most likely
  // means "end of month," and 28 is the closest day guaranteed to exist in
  // every month.
  return String(Math.min(day, 28));
}

export default function CreditReportPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const [configTarget, setConfigTarget] = useState<CreditReportRowView | "new" | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<CreditReportRowView | null>(null);
  const [historyTarget, setHistoryTarget] = useState<CreditReportRowView | null>(null);

  const canManage = can("CREDIT.MANAGE");

  const { data: reportPage, isLoading } = useQuery({
    queryKey: queryKeys.list("credit-report", { page }),
    queryFn: () => apiClient.get<Paginated<CreditReportRowView>>("/credit/report", { page, pageSize: 20 }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.list("credit-report") });

  const columns: DataTableColumn<CreditReportRowView>[] = [
    {
      key: "customerName",
      header: "Customer",
      render: (row) => (
        <button
          type="button"
          onClick={() => setHistoryTarget(row)}
          className="text-left underline-offset-2 hover:underline"
        >
          {row.customerName}
        </button>
      ),
    },
    { key: "totalCredit", header: "Total Credit", render: (row) => formatAmount(row.totalCredit) },
    { key: "paymentsReceived", header: "Payments Received", render: (row) => formatAmount(row.paymentsReceived) },
    {
      key: "pending",
      header: "Pending",
      render: (row) => (
        <span className={Number(row.pending) > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
          {formatAmount(row.pending)}
        </span>
      ),
    },
    {
      key: "creditLimit",
      header: "Credit Limit",
      render: (row) => (row.creditLimit === null ? <Badge variant="outline">Unlimited</Badge> : formatAmount(row.creditLimit)),
    },
    {
      key: "settlementDay",
      header: "Settlement Day",
      render: (row) => (row.settlementDay === null ? "—" : `Day ${row.settlementDay} of the month`),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-heading">Credit Report</h1>
          <p className="text-muted-foreground">
            Customer-wise credit extended, payments received, and outstanding balance.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setConfigTarget("new")}>
            <Plus /> Add customer to credit
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={reportPage?.items ?? []}
        isLoading={isLoading}
        getRowId={(row) => row.customerId}
        emptyMessage="No customers have credit activity yet."
        pagination={reportPage?.pagination}
        onPageChange={setPage}
        actions={
          canManage
            ? (row) => (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon-sm" title="Record payment" onClick={() => setPaymentTarget(row)}>
                    <Wallet className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" title="Edit credit limit" onClick={() => setConfigTarget(row)}>
                    <Settings2 className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" title="Transaction history" onClick={() => setHistoryTarget(row)}>
                    <History className="size-4" />
                  </Button>
                </div>
              )
            : (row) => (
                <Button variant="ghost" size="icon-sm" title="Transaction history" onClick={() => setHistoryTarget(row)}>
                  <History className="size-4" />
                </Button>
              )
        }
      />

      {configTarget && (
        <CreditConfigDialog
          target={configTarget}
          onOpenChange={(open) => !open && setConfigTarget(null)}
          onSaved={() => {
            invalidate();
            setConfigTarget(null);
          }}
        />
      )}

      {paymentTarget && (
        <RecordPaymentDialog
          customer={paymentTarget}
          onOpenChange={(open) => !open && setPaymentTarget(null)}
          onSaved={() => {
            invalidate();
            setPaymentTarget(null);
          }}
        />
      )}

      {historyTarget && (
        <TransactionHistoryDialog customer={historyTarget} onOpenChange={(open) => !open && setHistoryTarget(null)} />
      )}
    </div>
  );
}

// Add mode ("new") lets an admin pick any customer and, in the same step,
// set their limit/settlement day and — only here, before any other credit
// activity exists for them — an opening/existing due amount. Edit mode
// (an existing report row) fixes the customer and drops the opening
// -balance fields entirely, since the server only accepts one for a
// customer with no prior ledger history (see credit.service.ts).
function CreditConfigDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: CreditReportRowView | "new";
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isNew = target === "new";
  const [customerId, setCustomerId] = useState(isNew ? "" : target.customerId);
  const [creditLimit, setCreditLimit] = useState(isNew ? "" : (target.creditLimit ?? ""));
  const [settlementDay, setSettlementDay] = useState(isNew ? "" : (target.settlementDay?.toString() ?? ""));
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingRemarks, setOpeningRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: customersPage } = useQuery({
    queryKey: queryKeys.list("customers", { pageSize: 100 }),
    queryFn: () => apiClient.get<Paginated<CustomerView>>("/customers", { page: 1, pageSize: 100 }),
    enabled: isNew,
  });

  const handleSubmit = async () => {
    if (isNew && !customerId) {
      toast.error("Select a customer first.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.patch(`/credit/customers/${customerId}`, {
        creditLimit: creditLimit === "" ? null : creditLimit,
        settlementDay: settlementDay === "" ? null : Number(settlementDay),
      });
      if (isNew && openingBalance !== "") {
        await apiClient.post(`/credit/customers/${customerId}/opening-balance`, {
          amount: openingBalance,
          remarks: openingRemarks || undefined,
        });
      }
      toast.success("Credit configuration saved");
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add customer to credit" : `Edit credit — ${target.customerName}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Set a per-customer credit limit, settlement day, and any existing due amount."
              : "Update this customer's credit limit override and settlement day."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isNew && (
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={(value) => setCustomerId(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {(customersPage?.items ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="creditLimit">Credit limit</Label>
              <Input
                id="creditLimit"
                inputMode="decimal"
                placeholder="No limit (unlimited)"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settlementDay">Settlement day</Label>
              <Input
                id="settlementDay"
                type="date"
                value={settlementDayToDateInputValue(settlementDay)}
                onChange={(e) => setSettlementDay(dateInputValueToSettlementDay(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">Only the day of month is used (recurring every month).</p>
            </div>
          </div>

          {isNew && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="openingBalance">Existing / opening due amount</Label>
                <Input
                  id="openingBalance"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Only for onboarding a customer who already owed money before this system existed. Leave blank
                  otherwise — can only be set once, before any other credit activity.
                </p>
              </div>
              {openingBalance !== "" && (
                <div className="space-y-1.5">
                  <Label htmlFor="openingRemarks">Remarks</Label>
                  <Textarea
                    id="openingRemarks"
                    placeholder="Carried over from previous system"
                    value={openingRemarks}
                    onChange={(e) => setOpeningRemarks(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoaderButton onClick={() => void handleSubmit()} loading={submitting}>
            Save
          </LoaderButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({
  customer,
  onOpenChange,
  onSaved,
}: {
  customer: CreditReportRowView;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!amount) {
      toast.error("Enter a payment amount.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/credit/customers/${customer.customerId}/payments`, {
        amount,
        paymentMethod,
        remarks: remarks || undefined,
      });
      toast.success("Payment recorded");
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment — {customer.customerName}</DialogTitle>
          <DialogDescription>Outstanding balance: {formatAmount(customer.pending)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="paymentAmount">Amount</Label>
            <Input
              id="paymentAmount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Paid via</Label>
            <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value ?? "CASH")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paymentRemarks">Remarks</Label>
            <Textarea
              id="paymentRemarks"
              placeholder="Reference / notes (optional)"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoaderButton onClick={() => void handleSubmit()} loading={submitting}>
            Record payment
          </LoaderButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransactionHistoryDialog({
  customer,
  onOpenChange,
}: {
  customer: CreditReportRowView;
  onOpenChange: (open: boolean) => void;
}) {
  const [page, setPage] = useState(1);

  const { data: transactionsPage, isLoading } = useQuery({
    queryKey: queryKeys.list("credit-transactions", { customerId: customer.customerId, page }),
    queryFn: () =>
      apiClient.get<Paginated<CreditTransactionView>>(`/credit/customers/${customer.customerId}/transactions`, {
        page,
        pageSize: 10,
      }),
  });

  const columns: DataTableColumn<CreditTransactionView>[] = [
    {
      key: "createdAt",
      header: "Date",
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {new Date(row.createdAt).toLocaleString()}
          {row.referenceType === "SALE" && row.referenceId && (
            <Link
              href={`/sales/${row.referenceId}`}
              className="inline-flex items-center text-muted-foreground hover:text-foreground"
              title="View sale"
            >
              <ExternalLink className="size-3.5" />
            </Link>
          )}
        </span>
      ),
    },
    { key: "type", header: "Type", render: (row) => TRANSACTION_TYPE_LABELS[row.type] },
    {
      key: "amount",
      header: "Amount",
      render: (row) => (
        <span className={row.direction === "OUT" ? "text-destructive" : "text-emerald-600"}>
          {row.direction === "OUT" ? "+" : "-"}
          {formatAmount(row.amount)}
        </span>
      ),
    },
    {
      key: "paymentMethod",
      header: "Payment Type",
      render: (row) => row.paymentMethod ?? "—",
    },
    { key: "remarks", header: "Remarks", render: (row) => row.remarks ?? "—" },
    { key: "runningBalance", header: "Balance", render: (row) => formatAmount(row.runningBalance) },
  ];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Transaction history — {customer.customerName}</DialogTitle>
          <DialogDescription>Every in/out movement against this customer&apos;s credit account.</DialogDescription>
        </DialogHeader>

        <DataTable
          columns={columns}
          rows={transactionsPage?.items ?? []}
          isLoading={isLoading}
          getRowId={(row) => row.id}
          emptyMessage="No credit transactions yet."
          pagination={transactionsPage?.pagination}
          onPageChange={setPage}
        />
      </DialogContent>
    </Dialog>
  );
}
