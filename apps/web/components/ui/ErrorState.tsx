import { Button } from "./Button";

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-health-blocked/30 bg-health-blocked/5 px-6 py-10 text-center">
      <p className="text-sm font-medium text-health-blocked">Something went wrong</p>
      <p className="max-w-sm text-sm text-ink-muted">{message ?? "Failed to load data. Please try again."}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
