export interface TimeRange {
  id?: string;
  startTime: Date;
  endTime: Date | null;
}

/**
 * Pure overlap check mirroring the Postgres EXCLUDE constraint semantics:
 * `tstzrange(startTime, endTime, '[)')` — half-open, so back-to-back entries
 * (10:00-11:00 and 11:00-12:00) are legal. Only closed (endTime != null)
 * ranges are compared, matching the DB constraint's WHERE clause.
 * Application-level pre-check used only to produce a friendly 422 naming the
 * conflicting entry; the DB EXCLUDE constraint is authoritative.
 */
export function findOverlap(candidate: TimeRange, existing: TimeRange[]): TimeRange | null {
  if (candidate.endTime === null) return null;
  const candStart = candidate.startTime.getTime();
  const candEnd = candidate.endTime.getTime();

  for (const entry of existing) {
    if (entry.endTime === null) continue;
    if (candidate.id && entry.id === candidate.id) continue;
    const start = entry.startTime.getTime();
    const end = entry.endTime.getTime();
    // [)  overlap iff candStart < end && start < candEnd
    if (candStart < end && start < candEnd) {
      return entry;
    }
  }
  return null;
}

export function computeDurationMinutes(startTime: Date, endTime: Date): number {
  const ms = endTime.getTime() - startTime.getTime();
  return Math.max(1, Math.round(ms / 60000));
}
