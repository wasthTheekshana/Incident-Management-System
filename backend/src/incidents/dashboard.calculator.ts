/** Pure aggregation helpers for the dashboard; no database access so they stay easy to test. */

const COLOMBO_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** Calendar day (YYYY-MM-DD) in Sri Lanka time, matching how users read dates (NFR-11). */
export const colomboDay = (at: Date): string => new Date(at.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);

/** The last `days` Sri Lanka calendar days ending today, oldest first. */
export function dayKeys(days: number, now: Date): string[] {
  return Array.from({ length: days }, (_, i) => colomboDay(new Date(now.getTime() - (days - 1 - i) * DAY_MS)));
}

export interface TrendPoint {
  date: string;
  created: number;
  resolved: number;
}

export function buildTrend(
  rows: { createdAt: Date; resolvedAt: Date | null }[],
  days: number,
  now: Date,
): TrendPoint[] {
  const points = new Map(dayKeys(days, now).map((date) => [date, { date, created: 0, resolved: 0 }]));
  for (const row of rows) {
    const created = points.get(colomboDay(row.createdAt));
    if (created) created.created += 1;
    if (row.resolvedAt) {
      const resolved = points.get(colomboDay(row.resolvedAt));
      if (resolved) resolved.resolved += 1;
    }
  }
  return [...points.values()];
}

/** Share (0-100, one decimal) of resolved incidents that finished on or before their resolution deadline. */
export function slaCompliance(rows: { resolvedAt: Date; resolutionDueAt: Date }[]): number | null {
  if (rows.length === 0) return null;
  const met = rows.filter((r) => r.resolvedAt.getTime() <= r.resolutionDueAt.getTime()).length;
  return Math.round((met / rows.length) * 1000) / 10;
}

const minutes = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / 60_000);

/** Mean of elapsed minutes, ignoring time spent Pending where given (the SLA clock is paused then). */
export function averageMinutes(rows: { start: Date; end: Date; pausedMinutes?: number }[]): number | null {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + Math.max(0, minutes(r.start, r.end) - (r.pausedMinutes ?? 0)), 0);
  return Math.round(total / rows.length);
}

/** Counts by key, largest first, capped; the remainder is folded into "Other". */
export function topCounts(counts: Map<string, number>, limit: number): { name: string; count: number }[] {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit).map(([name, count]) => ({ name, count }));
  const rest = sorted.slice(limit).reduce((sum, [, count]) => sum + count, 0);
  return rest > 0 ? [...top, { name: 'Other', count: rest }] : top;
}
