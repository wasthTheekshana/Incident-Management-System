import type { Priority, SlaStatus, Stage } from '../api/types';

const COLOMBO = 'Asia/Colombo'; // NFR-11: stored in UTC, displayed in Sri Lanka time

const dateTime = new Intl.DateTimeFormat('en-GB', { timeZone: COLOMBO, dateStyle: 'medium', timeStyle: 'short' });

export const formatDateTime = (iso: string | null | undefined): string => (iso ? dateTime.format(new Date(iso)) : '—');

export const STAGE_LABEL: Record<Stage, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  PENDING: 'Pending',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  P1: 'P1 – Critical',
  P2: 'P2 – High',
  P3: 'P3 – Medium',
  P4: 'P4 – Low',
};

export const SLA_LABEL: Record<SlaStatus, string> = {
  ON_TRACK: 'On track',
  DUE_SOON: 'Due soon',
  BREACHED: 'Breached',
};

/** Allowed next stages, mirroring the server's workflow so the UI only offers legal moves. */
export const NEXT_STAGES: Record<Stage, Stage[]> = {
  NEW: [],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING', 'RESOLVED'],
  PENDING: ['IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export const formatMinutes = (minutes: number): string => {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} hr${minutes === 60 ? '' : 's'}`;
  return `${minutes} min`;
};

export const formatBytes = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Converts a value and unit from the SLA form to the minutes the API stores. */
export const toMinutes = (value: number, unit: 'min' | 'hr' | 'day'): number =>
  value * (unit === 'day' ? 1440 : unit === 'hr' ? 60 : 1);

export const fromMinutes = (minutes: number): { value: number; unit: 'min' | 'hr' | 'day' } =>
  minutes % 1440 === 0 ? { value: minutes / 1440, unit: 'day' } : minutes % 60 === 0 ? { value: minutes / 60, unit: 'hr' } : { value: minutes, unit: 'min' };
