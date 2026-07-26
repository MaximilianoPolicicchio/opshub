"use client";

import { useState } from "react";
import { AutomationTrigger } from "@opshub/contracts";
import { useAutomations, useSimulateAutomation, useWebhookStatus } from "@/hooks/useAutomations";
import { useAutomationRuns } from "@/hooks/useAutomations";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList, Skeleton } from "@/components/ui/Skeleton";
import { formatDateTime, titleCase, timeAgo } from "@/lib/formatters";
import type { Automation, AutomationRun } from "@/lib/types";

function runStatusTone(status: string) {
  if (status === "SUCCESS" || status === "SIMULATED") return "healthy" as const;
  if (status === "FAILED") return "blocked" as const;
  return "neutral" as const;
}

export default function AutomationsPage() {
  const [trigger, setTrigger] = useState("");
  const automations = useAutomations({ trigger: trigger || undefined });
  const runs = useAutomationRuns({});
  const webhook = useWebhookStatus();
  const simulate = useSimulateAutomation();
  const [result, setResult] = useState<AutomationRun | null>(null);
  const [drillInAutomation, setDrillInAutomation] = useState<Automation | null>(null);

  async function onSimulate(id: string) {
    const run = await simulate.mutateAsync(id);
    setResult(run);
  }

  const drillInRuns = drillInAutomation ? (runs.data ?? []).filter((r) => r.automationId === drillInAutomation.id) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Automations</h1>
        <div className="flex items-center gap-2 text-xs">
          {webhook.isLoading ? null : webhook.data?.configured ? (
            <Badge tone="healthy" dot>
              Webhook configured ({webhook.data.url})
            </Badge>
          ) : (
            <Badge tone="attention" dot>
              Webhook not configured
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-56" placeholder="All triggers" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
          {AutomationTrigger.map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </Select>
      </div>

      {automations.isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={4} />
          </CardBody>
        </Card>
      ) : automations.isError ? (
        <ErrorState onRetry={() => automations.refetch()} />
      ) : (automations.data?.length ?? 0) === 0 ? (
        <EmptyState title="No automations configured" description="Automations are created via the API/n8n integration." />
      ) : (
        <div className="space-y-2">
          {automations.data!.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <div>
                  <CardTitle>{a.name}</CardTitle>
                  {a.description ? <p className="mt-0.5 text-xs text-ink-muted">{a.description}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.enabled ? "healthy" : "neutral"}>{a.enabled ? "Enabled" : "Disabled"}</Badge>
                  <Badge tone="neutral">{titleCase(a.trigger)}</Badge>
                </div>
              </CardHeader>
              <CardBody className="flex items-center justify-between gap-3">
                <p className="text-xs text-ink-faint">{a.lastRunAt ? `Last run ${timeAgo(a.lastRunAt)}` : "Never run"}</p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setDrillInAutomation(a)}>
                    Run history
                  </Button>
                  <Button variant="secondary" size="sm" loading={simulate.isPending} onClick={() => onSimulate(a.id)}>
                    Simulate run
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!result} onClose={() => setResult(null)} title="Simulation result" size="md">
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone={runStatusTone(result.status)}>{titleCase(result.status)}</Badge>
              <span className="text-xs text-ink-faint">{formatDateTime(result.startedAt)}</span>
              {result.durationMs !== null ? <span className="text-xs text-ink-faint">{result.durationMs}ms</span> : null}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Request payload</p>
              <pre className="max-h-64 overflow-auto rounded-md bg-surface-hover p-3 text-xs text-ink-muted">
                {JSON.stringify(result.requestPayload, null, 2)}
              </pre>
            </div>
            {result.responseBody ? (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Response</p>
                <pre className="max-h-64 overflow-auto rounded-md bg-surface-hover p-3 text-xs text-ink-muted">{result.responseBody}</pre>
              </div>
            ) : null}
            {result.errorMessage ? <p className="text-sm text-health-blocked">{result.errorMessage}</p> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog open={!!drillInAutomation} onClose={() => setDrillInAutomation(null)} title={`Run history — ${drillInAutomation?.name ?? ""}`} size="lg">
        {runs.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : drillInRuns.length === 0 ? (
          <p className="text-sm text-ink-faint">No runs yet for this automation.</p>
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Started</Th>
                <Th>Status</Th>
                <Th>Simulated</Th>
                <Th>Duration</Th>
                <Th>Error</Th>
              </Tr>
            </Thead>
            <Tbody>
              {drillInRuns.map((r) => (
                <Tr key={r.id}>
                  <Td>{formatDateTime(r.startedAt)}</Td>
                  <Td>
                    <Badge tone={runStatusTone(r.status)}>{titleCase(r.status)}</Badge>
                  </Td>
                  <Td>{r.simulated ? "Yes" : "No"}</Td>
                  <Td>{r.durationMs !== null ? `${r.durationMs}ms` : "—"}</Td>
                  <Td className="max-w-xs truncate text-health-blocked">{r.errorMessage ?? ""}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Dialog>
    </div>
  );
}
