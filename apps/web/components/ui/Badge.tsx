import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "healthy" | "attention" | "blocked" | "critical" | "high" | "medium" | "low" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-hover text-ink-muted border-border",
  healthy: "bg-health-healthy/10 text-health-healthy border-health-healthy/30",
  attention: "bg-health-attention/10 text-health-attention border-health-attention/30",
  blocked: "bg-health-blocked/10 text-health-blocked border-health-blocked/30",
  critical: "bg-priority-critical/10 text-priority-critical border-priority-critical/30",
  high: "bg-priority-high/10 text-priority-high border-priority-high/30",
  medium: "bg-priority-medium/10 text-priority-medium border-priority-medium/30",
  low: "bg-priority-low/10 text-priority-low border-priority-low/30",
  info: "bg-accent/10 text-accent border-accent/30",
};

const dotClasses: Record<Tone, string> = {
  neutral: "bg-ink-faint",
  healthy: "bg-health-healthy",
  attention: "bg-health-attention",
  blocked: "bg-health-blocked",
  critical: "bg-priority-critical",
  high: "bg-priority-high",
  medium: "bg-priority-medium",
  low: "bg-priority-low",
  info: "bg-accent",
};

export function Badge({ className, tone = "neutral", dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium leading-5",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[tone])} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function healthTone(health: string): Tone {
  switch (health) {
    case "HEALTHY":
      return "healthy";
    case "NEEDS_ATTENTION":
      return "attention";
    case "BLOCKED":
      return "blocked";
    default:
      return "neutral";
  }
}

export function priorityTone(priority: string): Tone {
  switch (priority) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    default:
      return "neutral";
  }
}
