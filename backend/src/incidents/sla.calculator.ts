export type SlaStatus = 'ON_TRACK' | 'DUE_SOON' | 'BREACHED';

export const DUE_SOON_THRESHOLD = 0.75;
const MS_PER_MINUTE = 60_000;

export interface SlaTimes {
  responseDueAt: Date;
  resolutionDueAt: Date;
}

/**
 * Due times are always measured from creation (FR-18). Time spent in Pending (FR-19) extends only the
 * resolution due time; it is accumulated separately so a priority change can recompute from scratch.
 */
export function calculateDueTimes(
  createdAt: Date,
  responseMinutes: number,
  resolutionMinutes: number,
  pausedMinutes = 0,
): SlaTimes {
  return {
    responseDueAt: new Date(createdAt.getTime() + responseMinutes * MS_PER_MINUTE),
    resolutionDueAt: new Date(createdAt.getTime() + (resolutionMinutes + pausedMinutes) * MS_PER_MINUTE),
  };
}

/**
 * Status of one SLA target. `windowMinutes` is the configured target length (without pause extension),
 * so the 75% mark is relative to the target regardless of how long the incident was paused.
 * `at` is when the target was met, or "now" if it is still open.
 */
export function targetStatus(dueAt: Date, windowMinutes: number, at: Date): SlaStatus {
  const remainingMs = dueAt.getTime() - at.getTime();
  if (remainingMs < 0) return 'BREACHED';
  const elapsedFraction = 1 - remainingMs / (windowMinutes * MS_PER_MINUTE);
  return elapsedFraction >= DUE_SOON_THRESHOLD ? 'DUE_SOON' : 'ON_TRACK';
}

const SEVERITY: Record<SlaStatus, number> = { ON_TRACK: 0, DUE_SOON: 1, BREACHED: 2 };

export const worstStatus = (...statuses: SlaStatus[]): SlaStatus =>
  statuses.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), 'ON_TRACK' as SlaStatus);

export interface SlaSnapshot {
  responseDueAt: Date;
  resolutionDueAt: Date;
  respondedAt: Date | null;
  resolvedAt: Date | null;
  pausedAt: Date | null;
}

export interface SlaWindows {
  responseMinutes: number;
  resolutionMinutes: number;
}

export function incidentSlaStatus(incident: SlaSnapshot, windows: SlaWindows, now: Date): SlaStatus {
  // While Pending the resolution clock is frozen at the moment it paused.
  const resolutionClock = incident.resolvedAt ?? incident.pausedAt ?? now;
  const response = targetStatus(incident.responseDueAt, windows.responseMinutes, incident.respondedAt ?? now);
  const resolution = targetStatus(incident.resolutionDueAt, windows.resolutionMinutes, resolutionClock);
  return worstStatus(response, resolution);
}
