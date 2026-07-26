"use client";

import Link from "next/link";
import { useFinancialOverview } from "@/hooks/useBudget";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge, healthTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList, Skeleton } from "@/components/ui/Skeleton";
import { formatMoney, formatHours, formatPercent, titleCase } from "@/lib/formatters";
import { cn } from "@/lib/cn";

export default function FinancialPage() {
  const overview = useFinancialOverview();

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold text-ink">Financial</h1>

      {overview.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : overview.isError ? (
        <ErrorState onRetry={() => overview.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(overview.data?.totalsByCurrency ?? {}).map(([currency, totals]) => (
            <Card key={currency}>
              <CardHeader>
                <CardTitle>{currency}</CardTitle>
              </CardHeader>
              <CardBody className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-ink-faint">Budget</p>
                  <p className="text-lg font-semibold tabular-nums text-ink">{formatMoney(totals.budgetAmount, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Tracked value</p>
                  <p className="text-lg font-semibold tabular-nums text-ink">{formatMoney(totals.trackedValue, currency)}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Budget vs actual by project</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {overview.isLoading ? (
            <div className="p-4">
              <SkeletonList rows={5} />
            </div>
          ) : overview.isError ? null : (overview.data?.rows.length ?? 0) === 0 ? (
            <div className="p-4">
              <EmptyState title="No budgets set" description="Set a budget on a project to see it tracked here." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Project</Th>
                  <Th>Health</Th>
                  <Th>Billing</Th>
                  <Th>Budget</Th>
                  <Th>Tracked value</Th>
                  <Th>Remaining</Th>
                  <Th>Billable hours</Th>
                  <Th>Burn</Th>
                </Tr>
              </Thead>
              <Tbody>
                {overview.data!.rows.map((row) => (
                  <Tr key={row.projectId}>
                    <Td>
                      <Link href={`/projects/${row.projectId}`} className="font-medium text-ink hover:underline">
                        {row.projectName}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={healthTone(row.health)} dot>
                        {titleCase(row.health)}
                      </Badge>
                    </Td>
                    <Td>{titleCase(row.billingModel)}</Td>
                    <Td>{formatMoney(row.budgetAmount, row.currency)}</Td>
                    <Td>{formatMoney(row.trackedValue, row.currency)}</Td>
                    <Td>{formatMoney(row.remaining, row.currency)}</Td>
                    <Td>{formatHours(row.billableHours)}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-hover">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              row.burnPercent >= 100 ? "bg-health-blocked" : row.burnPercent >= 75 ? "bg-health-attention" : "bg-health-healthy",
                            )}
                            style={{ width: `${Math.min(100, row.burnPercent)}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-ink-muted">{formatPercent(row.burnPercent)}</span>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
