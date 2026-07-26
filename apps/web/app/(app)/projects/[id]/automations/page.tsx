"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useAutomations, useSimulateAutomation } from "@/hooks/useAutomations";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatDateTime, titleCase, timeAgo } from "@/lib/formatters";
import type { AutomationRun } from "@/lib/types";

export default function ProjectAutomationsPage() {
  const { id } = useParams<{ id: string }>();
  const automations = useAutomations({ projectId: id });
  const simulate = useSimulateAutomation();
  const [result, setResult] = useState<AutomationRun | null>(null);

  async function onSimulate(automationId: string) {
    const run = await simulate.mutateAsync(automationId);
    setResult(run);
  }

  return (
    <div className="space-y-4">
      {automations.isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={3} />
          </CardBody>
        </Card>
      ) : automations.isError ? (
        <ErrorState onRetry={() => automations.refetch()} />
      ) : (automations.data?.length ?? 0) === 0 ? (
        <EmptyState title="No automations for this project" description="Automations configured for the whole workspace also apply here." />
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
                <Button variant="secondary" size="sm" loading={simulate.isPending} onClick={() => onSimulate(a.id)}>
                  Simulate run
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!result} onClose={() => setResult(null)} title="Simulation result" size="md">
        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone={result.status === "SUCCESS" || result.status === "SIMULATED" ? "healthy" : "blocked"}>{titleCase(result.status)}</Badge>
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
    </div>
  );
}
