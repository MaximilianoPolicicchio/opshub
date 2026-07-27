"use client";

import { useMemo, useState } from "react";
import { ExpenseStatus as ExpenseStatuses, CostFrequency, CostCategory } from "@opshub/contracts";
import {
  useVendors,
  useCreateVendor,
  useSubscriptions,
  useCreateSubscription,
  useExpenses,
  useCreateExpense,
  useReviewExpense,
  usePendingReviewExpenses,
  useCostSummary,
} from "@/hooks/useCosts";
import { useProjects } from "@/hooks/useProjects";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatMoney, formatDate, titleCase } from "@/lib/formatters";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Last 12 months, newest first. */
function recentMonths(): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  }
  return out;
}

function statusTone(status: string) {
  if (status === "CONFIRMED" || status === "PAID") return "healthy" as const;
  if (status === "REJECTED") return "blocked" as const;
  return "attention" as const;
}

export default function CostsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [projectId, setProjectId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [status, setStatus] = useState("");

  const summary = useCostSummary(month);
  const vendors = useVendors();
  const projects = useProjects({});
  const subscriptions = useSubscriptions({});
  const pending = usePendingReviewExpenses();
  const expenses = useExpenses({
    month,
    projectId: projectId || undefined,
    vendorId: vendorId || undefined,
    status: status || undefined,
  });

  const review = useReviewExpense();

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);

  const projectRows = useMemo(() => projects.data?.rows ?? [], [projects.data]);
  const months = useMemo(recentMonths, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink">Costs</h1>
          <p className="text-xs text-ink-faint">
            What each project costs, expected versus actual. Entered by hand — no mailbox is connected.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-36" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setVendorOpen(true)}>
            Add vendor
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setSubOpen(true)}>
            Add subscription
          </Button>
          <Button size="sm" onClick={() => setExpenseOpen(true)}>
            Log expense
          </Button>
        </div>
      </div>

      {summary.isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={3} />
          </CardBody>
        </Card>
      ) : summary.isError ? (
        <ErrorState onRetry={() => summary.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(summary.data?.byCurrency ?? []).length === 0 ? (
              <Card className="sm:col-span-2 lg:col-span-3">
                <CardBody>
                  <EmptyState
                    title="Nothing recorded for this month"
                    description="Add a vendor, then a subscription for what you expect to pay, then log the real charges as they arrive."
                  />
                </CardBody>
              </Card>
            ) : (
              summary.data!.byCurrency.map((c) => {
                const over = Number(c.difference) > 0;
                return (
                  <Card key={c.currency}>
                    <CardHeader>
                      <CardTitle>{c.currency}</CardTitle>
                      <Badge tone={over ? "attention" : "healthy"}>
                        {over ? "Over expected" : "Within expected"}
                      </Badge>
                    </CardHeader>
                    <CardBody className="grid grid-cols-3 gap-2 text-xs">
                      <Stat label="Expected" value={formatMoney(c.expected, c.currency)} />
                      <Stat label="Actual" value={formatMoney(c.actual, c.currency)} />
                      <Stat
                        label="Difference"
                        value={formatMoney(c.difference, c.currency)}
                        tone={over ? "danger" : undefined}
                      />
                    </CardBody>
                  </Card>
                );
              })
            )}
          </div>

          {(summary.data?.pendingReviewCount ?? 0) > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Needs review</CardTitle>
                <Badge tone="attention">{summary.data!.pendingReviewCount}</Badge>
              </CardHeader>
              <CardBody>
                <p className="mb-3 text-xs text-ink-muted">
                  These are excluded from the totals above until you decide — nothing imported can move the monthly
                  close on its own.
                </p>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Date</Th>
                      <Th>Vendor</Th>
                      <Th>Project</Th>
                      <Th>Amount</Th>
                      <Th>Source</Th>
                      <Th />
                    </Tr>
                  </Thead>
                  <Tbody>
                    {(pending.data ?? []).map((e) => (
                      <Tr key={e.id}>
                        <Td>{formatDate(e.incurredAt)}</Td>
                        <Td>{e.vendor?.name ?? "—"}</Td>
                        <Td>{e.project?.name ?? "Unassigned"}</Td>
                        <Td>{formatMoney(String(e.amount), e.currency)}</Td>
                        <Td>{titleCase(e.source)}</Td>
                        <Td>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={review.isPending}
                              onClick={() => review.mutate({ id: e.id, status: "CONFIRMED" })}
                            >
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={review.isPending}
                              onClick={() => review.mutate({ id: e.id, status: "REJECTED" })}
                            >
                              Reject
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          ) : null}

          {(summary.data?.priceIncreases ?? []).length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Price increases</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="mb-3 text-xs text-ink-muted">
                  Charged more than the subscription expects. Update the subscription once you have confirmed the new
                  price — nothing is changed automatically.
                </p>
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Subscription</Th>
                      <Th>Vendor</Th>
                      <Th>Expected</Th>
                      <Th>Charged</Th>
                      <Th>Increase</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {summary.data!.priceIncreases.map((p) => (
                      <Tr key={p.subscriptionId}>
                        <Td>{p.subscriptionName}</Td>
                        <Td>{p.vendorName}</Td>
                        <Td>{formatMoney(p.expectedAmount, p.currency)}</Td>
                        <Td>{formatMoney(p.chargedAmount, p.currency)}</Td>
                        <Td>
                          <span className="font-medium text-danger">
                            +{formatMoney(p.increase, p.currency)} ({p.increasePercent}%)
                          </span>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>By project</CardTitle>
            </CardHeader>
            <CardBody>
              {(summary.data?.byProject ?? []).length === 0 ? (
                <p className="text-sm text-ink-faint">No costs attributed this month.</p>
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Project</Th>
                      <Th>Currency</Th>
                      <Th>Expected</Th>
                      <Th>Actual</Th>
                      <Th>Difference</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {summary.data!.byProject.map((r) => (
                      <Tr key={`${r.key ?? "unassigned"}-${r.currency}`}>
                        <Td>{r.name}</Td>
                        <Td>{r.currency}</Td>
                        <Td>{formatMoney(r.expected, r.currency)}</Td>
                        <Td>{formatMoney(r.actual, r.currency)}</Td>
                        <Td>
                          <span className={Number(r.difference) > 0 ? "text-danger" : "text-ink"}>
                            {formatMoney(r.difference, r.currency)}
                          </span>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select className="w-48" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="All projects">
              {projectRows.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select className="w-48" value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="All vendors">
              {(vendors.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
            <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses">
              {ExpenseStatuses.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </div>

          {expenses.isLoading ? (
            <SkeletonList rows={4} />
          ) : expenses.isError ? (
            <ErrorState onRetry={() => expenses.refetch()} />
          ) : (expenses.data ?? []).length === 0 ? (
            <EmptyState title="No expenses match these filters" description="Try a different month, or log one." />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Vendor</Th>
                  <Th>Project</Th>
                  <Th>Subscription</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {expenses.data!.map((e) => (
                  <Tr key={e.id}>
                    <Td>{formatDate(e.incurredAt)}</Td>
                    <Td>{e.vendor?.name ?? "—"}</Td>
                    <Td>{e.project?.name ?? <span className="text-ink-faint">Unassigned</span>}</Td>
                    <Td>{e.subscription?.name ?? <span className="text-ink-faint">—</span>}</Td>
                    <Td>{formatMoney(String(e.amount), e.currency)}</Td>
                    <Td>
                      <Badge tone={statusTone(e.status)}>{titleCase(e.status)}</Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <SubscriptionsCard />

      <VendorDialog open={vendorOpen} onClose={() => setVendorOpen(false)} />
      <SubscriptionDialog
        open={subOpen}
        onClose={() => setSubOpen(false)}
        vendors={vendors.data ?? []}
        projects={projectRows}
      />
      <ExpenseDialog
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        vendors={vendors.data ?? []}
        projects={projectRows}
        subscriptions={subscriptions.data ?? []}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <p className="text-ink-faint">{label}</p>
      <p className={`font-medium ${tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function SubscriptionsCard() {
  const subs = useSubscriptions({});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscriptions</CardTitle>
      </CardHeader>
      <CardBody>
        {subs.isLoading ? (
          <SkeletonList rows={3} />
        ) : (subs.data ?? []).length === 0 ? (
          <EmptyState
            title="No subscriptions yet"
            description="A subscription records what you expect to pay. It is what the monthly comparison measures against."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Vendor</Th>
                <Th>Project</Th>
                <Th>Expected</Th>
                <Th>Frequency</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {subs.data!.map((s) => (
                <Tr key={s.id}>
                  <Td>{s.name}</Td>
                  <Td>{s.vendor?.name ?? "—"}</Td>
                  <Td>{s.project?.name ?? <span className="text-ink-faint">Unassigned</span>}</Td>
                  <Td>{formatMoney(String(s.expectedAmount), s.currency)}</Td>
                  <Td>{titleCase(s.frequency)}</Td>
                  <Td>
                    <Badge tone={s.isActive ? "healthy" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

function VendorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateVendor();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({ name });
      setName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the vendor");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add vendor" size="sm">
      <div className="space-y-3">
        <div>
          <Label htmlFor="vendor-name">Name</Label>
          <Input id="vendor-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vercel" />
          <p className="mt-1 text-xxs text-ink-faint">
            Matched case-insensitively, so the same supplier cannot be added twice.
          </p>
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name.trim()}>
            Add vendor
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function SubscriptionDialog({
  open,
  onClose,
  vendors,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  vendors: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const create = useCreateSubscription();
  const [form, setForm] = useState({
    vendorId: "",
    projectId: "",
    name: "",
    expectedAmount: "",
    currency: "USD",
    frequency: "MONTHLY",
    category: "SAAS",
    nextChargeAt: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({
        vendorId: form.vendorId,
        projectId: form.projectId || null,
        name: form.name,
        expectedAmount: form.expectedAmount,
        currency: form.currency,
        frequency: form.frequency,
        category: form.category,
        nextChargeAt: form.nextChargeAt ? new Date(form.nextChargeAt).toISOString() : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the subscription");
    }
  }

  const yearlyWithoutDate = form.frequency === "YEARLY" && !form.nextChargeAt;

  return (
    <Dialog open={open} onClose={onClose} title="Add subscription" size="md">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sub-vendor">Vendor</Label>
            <Select id="sub-vendor" value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} placeholder="Select a vendor">
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sub-project">Project (optional)</Label>
            <Select id="sub-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} placeholder="Unassigned">
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="sub-name">Name</Label>
          <Input id="sub-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Vercel Pro" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="sub-amount">Expected amount</Label>
            <Input
              id="sub-amount"
              inputMode="decimal"
              value={form.expectedAmount}
              onChange={(e) => setForm({ ...form, expectedAmount: e.target.value })}
              placeholder="20.00"
            />
          </div>
          <div>
            <Label htmlFor="sub-currency">Currency</Label>
            <Input id="sub-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} />
          </div>
          <div>
            <Label htmlFor="sub-freq">Frequency</Label>
            <Select id="sub-freq" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              {CostFrequency.map((f) => (
                <option key={f} value={f}>
                  {titleCase(f)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="sub-category">Category</Label>
            <Select id="sub-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CostCategory.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sub-next">Next charge{form.frequency === "YEARLY" ? "" : " (optional)"}</Label>
            <Input id="sub-next" type="date" value={form.nextChargeAt} onChange={(e) => setForm({ ...form, nextChargeAt: e.target.value })} />
          </div>
        </div>
        {yearlyWithoutDate ? (
          <p className="text-xs text-warning">
            A yearly subscription without a charge date cannot be scheduled, so it will not appear as expected in any
            month.
          </p>
        ) : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!form.vendorId || !form.name || !form.expectedAmount}>
            Add subscription
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ExpenseDialog({
  open,
  onClose,
  vendors,
  projects,
  subscriptions,
}: {
  open: boolean;
  onClose: () => void;
  vendors: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  subscriptions: { id: string; name: string; vendorId: string }[];
}) {
  const create = useCreateExpense();
  const [form, setForm] = useState({
    vendorId: "",
    subscriptionId: "",
    projectId: "",
    amount: "",
    currency: "USD",
    incurredAt: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Only subscriptions belonging to the chosen vendor can apply to this charge.
  const relevantSubs = subscriptions.filter((s) => !form.vendorId || s.vendorId === form.vendorId);

  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({
        vendorId: form.vendorId,
        subscriptionId: form.subscriptionId || null,
        projectId: form.projectId || null,
        amount: form.amount,
        currency: form.currency,
        incurredAt: new Date(form.incurredAt).toISOString(),
        notes: form.notes || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log the expense");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Log expense" size="md">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="exp-vendor">Vendor</Label>
            <Select
              id="exp-vendor"
              value={form.vendorId}
              onChange={(e) => setForm({ ...form, vendorId: e.target.value, subscriptionId: "" })}
              placeholder="Select a vendor"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="exp-sub">Subscription (optional)</Label>
            <Select id="exp-sub" value={form.subscriptionId} onChange={(e) => setForm({ ...form, subscriptionId: e.target.value })} placeholder="One-off charge">
              {relevantSubs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xxs text-ink-faint">Linking it is what detects a price increase.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="exp-amount">Amount</Label>
            <Input id="exp-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="25.00" />
          </div>
          <div>
            <Label htmlFor="exp-currency">Currency</Label>
            <Input id="exp-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={3} />
          </div>
          <div>
            <Label htmlFor="exp-date">Date</Label>
            <Input id="exp-date" type="date" value={form.incurredAt} onChange={(e) => setForm({ ...form, incurredAt: e.target.value })} />
          </div>
        </div>
        <div>
          <Label htmlFor="exp-project">Project (optional)</Label>
          <Select id="exp-project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} placeholder="Unassigned">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xxs text-ink-faint">
            Leave unassigned for shared infrastructure. It is reported as its own bucket, not split.
          </p>
        </div>
        <div>
          <Label htmlFor="exp-notes">Notes (optional)</Label>
          <Input id="exp-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!form.vendorId || !form.amount}>
            Log expense
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
