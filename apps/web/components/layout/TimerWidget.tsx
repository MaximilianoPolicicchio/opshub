"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useActiveTimer, useStopTimer } from "@/hooks/useTimer";
import { formatElapsed } from "@/lib/formatters";
import { Button } from "@/components/ui/Button";
import { QuickStartTimerDialog } from "@/components/time/QuickStartTimerDialog";

export function TimerWidget() {
  const { data: activeTimer, isLoading } = useActiveTimer();
  const stopTimer = useStopTimer();
  const [, forceTick] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!activeTimer) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeTimer]);

  if (isLoading) {
    return <div className="h-8 w-40 animate-skeleton rounded-md bg-surface-hover" aria-hidden />;
  }

  if (!activeTimer) {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
          <PlayIcon className="h-3.5 w-3.5" />
          Start timer
        </Button>
        <QuickStartTimerDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-accent/30 bg-accent/10 py-1 pl-3 pr-1.5">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
      <Link href="/time" className="text-xs font-medium text-ink hover:underline">
        {activeTimer.project?.name ?? "Timer running"}
      </Link>
      <span className="font-mono text-xs tabular-nums text-ink-muted">{formatElapsed(activeTimer.startTime)}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2"
        aria-label="Stop timer"
        loading={stopTimer.isPending}
        onClick={() => stopTimer.mutate({ id: activeTimer.id })}
      >
        <StopIcon className="h-3 w-3" />
      </Button>
    </div>
  );
}

function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" {...props} aria-hidden>
      <path d="M3.5 2.5v9l8-4.5-8-4.5Z" />
    </svg>
  );
}
function StopIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" {...props} aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1" />
    </svg>
  );
}
