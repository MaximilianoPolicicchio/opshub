import { RecurrenceAnchor, RecurrenceUnit } from "@opshub/contracts";

// All date-component math below uses the UTC getters/setters (not the local
// ones) so results are independent of the host machine's timezone. Full IANA
// workspace-timezone-aware arithmetic (per PROJECT_PLAN.md §7#11) would need
// a timezone library (e.g. luxon); this UTC-calendar approximation is a
// pragmatic v1 simplification documented in the API agent's final report.
function addInterval(date: Date, unit: RecurrenceUnit, interval: number): Date {
  const d = new Date(date);
  switch (unit) {
    case "DAY":
      d.setUTCDate(d.getUTCDate() + interval);
      return d;
    case "WEEK":
      d.setUTCDate(d.getUTCDate() + interval * 7);
      return d;
    case "MONTH": {
      // Clamp to end-of-month: Jan 31 + 1 month = Feb 28/29.
      const targetMonth = d.getUTCMonth() + interval;
      const year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
      const month = ((targetMonth % 12) + 12) % 12;
      const day = d.getUTCDate();
      const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      d.setUTCFullYear(year, month, Math.min(day, daysInTargetMonth));
      return d;
    }
  }
}

export interface NextDueDateInput {
  anchor: RecurrenceAnchor;
  unit: RecurrenceUnit;
  interval: number;
  previousDueDate: Date | null;
  completedAt: Date;
  today: Date;
}

/**
 * Pure recurrence date math, PROJECT_PLAN.md §2.9(i). Returns the next due
 * date for the following occurrence, or null if recurrenceEndsAt (checked by
 * the caller) should stop generation.
 */
export function computeNextDueDate(input: NextDueDateInput): Date {
  if (input.anchor === "COMPLETION_DATE") {
    return addInterval(input.completedAt, input.unit, input.interval);
  }

  // anchor === DUE_DATE
  const base = input.previousDueDate ?? input.completedAt;
  let next = addInterval(base, input.unit, input.interval);

  // If completed very late, roll forward in whole intervals until >= today.
  let guard = 0;
  while (next.getTime() < input.today.getTime() && guard < 10000) {
    next = addInterval(next, input.unit, input.interval);
    guard++;
  }
  return next;
}

export function shouldStopRecurrence(nextDue: Date, recurrenceEndsAt: Date | null): boolean {
  return recurrenceEndsAt !== null && nextDue.getTime() > recurrenceEndsAt.getTime();
}
