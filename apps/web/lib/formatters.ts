/**
 * Shared formatting helpers. Money and durations should never be formatted
 * ad-hoc in components — always go through these so behavior stays
 * consistent across the app.
 */

/** Format money. Amounts may arrive as Prisma Decimal-serialized strings or numbers. */
export function formatMoney(amount: number | string | null | undefined, currency = "USD"): string {
  if (amount === null || amount === undefined) return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Minutes -> "2h 15m" / "45m" / "0m" */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "—";
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Hours (decimal) -> "2h 15m" */
export function formatHours(hours: number | string | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  const n = typeof hours === "string" ? Number(hours) : hours;
  if (Number.isNaN(n)) return "—";
  return formatDuration(n * 60);
}

export function formatPercent(pct: number | string | null | undefined, digits = 0): string {
  if (pct === null || pct === undefined) return "—";
  const n = typeof pct === "string" ? Number(pct) : pct;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

/** Short date, e.g. "Jul 25" */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

/** Full date + time, e.g. "Jul 25, 2026, 2:03 PM" */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Relative day label used for due dates: "3d overdue", "Due today", "in 2d" */
export function formatDueLabel(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - startOfToday.getTime()) / 86400000);

  if (diffDays === 0) return "Due today";
  if (diffDays === -1) return "1d overdue";
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays}d`;
}

export function isOverdue(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d.getTime() < startOfToday.getTime();
}

export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return formatDate(d);
}

/** Elapsed time between a start timestamp and now, live "1h 03m 12s" for the running timer widget. */
export function formatElapsed(startTime: string | Date): string {
  const start = typeof startTime === "string" ? new Date(startTime) : startTime;
  const totalSeconds = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
