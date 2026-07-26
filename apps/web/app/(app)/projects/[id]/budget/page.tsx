"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { BillingModel } from "@opshub/contracts";
import { useBudget, useBudgetAlerts, useUpsertBudget, useAcknowledgeAlert } from "@/hooks/useBudget";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, formatHours, formatPercent, formatDateTime, titleCase } from "@/lib/formatters";
import { cn } from "@/lib/cn";

export default function ProjectBudgetPage() {
  const { id } = useParams<{ id: string }>();
  const budget = useBudget(id);
  const alerts = useBudgetAlerts(id);
  const upsertBudget = useUpsertBudget(id);
  const acknowledgeAlert = useAcknowledgeAlert(id);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [billingModel, setBillingModel] = useState("HOURLY");
  const [currency, setCurrency] = useState("USD");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");

  function openEdit() {
    const b = budget.data?.budget;
    setBillingModel(b?.billingModel ?? "HOURLY");
    setCurrency(b?.currency ?? "USD");
    setBudgetAmount(b?.budgetAmount != null ? String(b.budgetAmount) : "");
    setHourlyRate(b?.hourlyRate != null ? String(b.hourlyRate) : "");
    setEstimatedHours(b?.estimatedHours != null ? String(b.estimatedHours) : "");
    setDialogOpen(true);
  }

  async function onSubmit() {
    await upsertBudget.mutateAsync({
      billingModel,
      currency,
      budgetAmount: budgetAmount ? Number(budgetAmount) : null,
      hourlyRate: hourlyRate ? Number(hourlyRate) : null,
      estimatedHours: estimatedHours ? Number(estimatedHours) : null,
      alertThresholds: budget.data?.budget.alertThresholds ?? [50, 75, 90, 100],
    });
    setDialogOpen(false);
  }

  if (budget.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (budget.isError) {
    return <ErrorState onRetry={() => budget.refetch()} />;
  }

  if (!budget.data) {
    return (
      <>
        <EmptyState
          title="No budget set for this project"
          description="Set a budget to track burn against tracked value and estimated hours."
          action={
            <Button variant="primary" size="sm" onClick={openEdit}>
              Set budget
            </Button>
          }
        />
        <BudgetDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          billingModel={billingModel}
          setBillingModel={setBillingModel}
          currency={currency}
          setCurrency={setCurrency}
          budgetAmount={budgetAmount}
          setBudgetAmount={setBudgetAmount}
          hourlyRate={hourlyRate}
          setHourlyRate={setHourlyRate}
          estimatedHours={estimatedHours}
          setEstimatedHours={setEstimatedHours}
          onSubmit={onSubmit}
          pending={upsertBudget.isPending}
          error={upsertBudget.isError}
        />
      </>
    );
  }

  const { budget: b, burn } = budget.data;
  const burnPct = Math.min(100, Number(burn.burnPercent) || 0);
  const overBudget = Number(burn.burnPercent) >= 100;
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference * (1 - burnPct / 100);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Burn</CardTitle>
            <Badge tone="neutral">{titleCase(b.billingModel)}</Badge>
          </CardHeader>
          <CardBody className="flex flex-col items-center gap-3 py-6">
            <svg width="110" height="110" viewBox="0 0 100 100" role="img" aria-label={`Budget burn ${formatPercent(burn.burnPercent)}`}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-surface-hover" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="currentColor"
                className={overBudget ? "text-health-blocked" : burnPct >= 75 ? "text-health-attention" : "text-health-healthy"}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
              <text x="50" y="54" textAnchor="middle" className="fill-ink text-[18px] font-semibold">
                {formatPercent(burn.burnPercent)}
              </text>
            </svg>
            <Button variant="secondary" size="sm" onClick={openEdit}>
              Edit budget
            </Button>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Budget vs tracked</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Budget" value={formatMoney(b.budgetAmount, b.currency)} />
            <Stat label="Tracked value" value={formatMoney(burn.trackedValue, b.currency)} />
            <Stat label="Remaining" value={formatMoney(burn.remainingAmount, b.currency)} />
            <Stat label="Hourly rate" value={b.hourlyRate ? formatMoney(b.hourlyRate, b.currency) : "—"} />
            <Stat label="Estimated hours" value={formatHours(b.estimatedHours)} />
            <Stat label="Tracked hours" value={formatHours(burn.trackedHours)} />
            <Stat label="Billable hours" value={formatHours(burn.billableHours)} />
            <Stat label="Remaining hours" value={burn.remainingHours != null ? formatHours(burn.remainingHours) : "—"} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {alerts.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (alerts.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-ink-faint">No budget alerts have fired.</p>
          ) : (
            alerts.data!.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                  a.acknowledgedAt ? "border-border-subtle" : "border-health-attention/30 bg-health-attention/10",
                )}
              >
                <div>
                  <p className="text-sm text-ink">
                    Reached {a.threshold}% burn ({formatPercent(a.burnPercentAtFire)} at {formatMoney(a.amountAtFire, b.currency)})
                  </p>
                  <p className="text-xs text-ink-faint">{formatDateTime(a.triggeredAt)}</p>
                </div>
                {a.acknowledgedAt ? (
                  <Badge tone="neutral">Acknowledged</Badge>
                ) : (
                  <Button variant="secondary" size="sm" loading={acknowledgeAlert.isPending} onClick={() => acknowledgeAlert.mutate(a.id)}>
                    Acknowledge
                  </Button>
                )}
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <BudgetDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        billingModel={billingModel}
        setBillingModel={setBillingModel}
        currency={currency}
        setCurrency={setCurrency}
        budgetAmount={budgetAmount}
        setBudgetAmount={setBudgetAmount}
        hourlyRate={hourlyRate}
        setHourlyRate={setHourlyRate}
        estimatedHours={estimatedHours}
        setEstimatedHours={setEstimatedHours}
        onSubmit={onSubmit}
        pending={upsertBudget.isPending}
        error={upsertBudget.isError}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function BudgetDialog({
  open,
  onClose,
  billingModel,
  setBillingModel,
  currency,
  setCurrency,
  budgetAmount,
  setBudgetAmount,
  hourlyRate,
  setHourlyRate,
  estimatedHours,
  setEstimatedHours,
  onSubmit,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  billingModel: string;
  setBillingModel: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  budgetAmount: string;
  setBudgetAmount: (v: string) => void;
  hourlyRate: string;
  setHourlyRate: (v: string) => void;
  estimatedHours: string;
  setEstimatedHours: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Edit budget" size="sm">
      <div className="space-y-4">
        <div>
          <Label htmlFor="b-model">Billing model</Label>
          <Select id="b-model" value={billingModel} onChange={(e) => setBillingModel(e.target.value)}>
            {BillingModel.map((m) => (
              <option key={m} value={m}>
                {titleCase(m)}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="b-currency">Currency</Label>
            <Input id="b-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
          <div>
            <Label htmlFor="b-amount">Budget amount</Label>
            <Input id="b-amount" type="number" min={0} value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="b-rate">Hourly rate</Label>
            <Input id="b-rate" type="number" min={0} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="b-est">Estimated hours</Label>
          <Input id="b-est" type="number" min={0} value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
        </div>
        <FieldError>{error ? "Could not save the budget. Please try again." : null}</FieldError>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={onSubmit}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
