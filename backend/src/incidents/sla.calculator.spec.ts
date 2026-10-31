import { calculateDueTimes, incidentSlaStatus, targetStatus } from './sla.calculator';

const MIN = 60_000;
const created = new Date('2026-10-20T10:00:00Z');
const at = (minutesAfterCreation: number) => new Date(created.getTime() + minutesAfterCreation * MIN);

describe('calculateDueTimes', () => {
  it('measures P1 defaults (15 min / 4 hrs) from creation', () => {
    const { responseDueAt, resolutionDueAt } = calculateDueTimes(created, 15, 240);
    expect(responseDueAt).toEqual(at(15));
    expect(resolutionDueAt).toEqual(at(240));
  });

  it('extends only the resolution due time by paused minutes', () => {
    const { responseDueAt, resolutionDueAt } = calculateDueTimes(created, 15, 240, 30);
    expect(responseDueAt).toEqual(at(15));
    expect(resolutionDueAt).toEqual(at(270));
  });
});

describe('targetStatus', () => {
  const due = at(100);
  it('is ON_TRACK before 75% elapsed', () => expect(targetStatus(due, 100, at(74))).toBe('ON_TRACK'));
  it('is DUE_SOON at exactly 75% elapsed', () => expect(targetStatus(due, 100, at(75))).toBe('DUE_SOON'));
  it('is DUE_SOON right up to the due time', () => expect(targetStatus(due, 100, at(100))).toBe('DUE_SOON'));
  it('is BREACHED once the due time has passed', () => expect(targetStatus(due, 100, at(101))).toBe('BREACHED'));
});

describe('incidentSlaStatus', () => {
  const windows = { responseMinutes: 15, resolutionMinutes: 240 };
  const base = {
    responseDueAt: at(15),
    resolutionDueAt: at(240),
    respondedAt: null,
    resolvedAt: null,
    pausedAt: null,
  };

  it('breaches on an unanswered response even if resolution is fine', () => {
    expect(incidentSlaStatus(base, windows, at(20))).toBe('BREACHED');
  });

  it('ignores response time once the incident has been acknowledged in time', () => {
    expect(incidentSlaStatus({ ...base, respondedAt: at(5) }, windows, at(20))).toBe('ON_TRACK');
  });

  it('keeps a late acknowledgement as breached', () => {
    expect(incidentSlaStatus({ ...base, respondedAt: at(16) }, windows, at(17))).toBe('BREACHED');
  });

  it('freezes the resolution clock while paused (FR-19)', () => {
    const pausedAtMinute60 = { ...base, respondedAt: at(5), pausedAt: at(60) };
    expect(incidentSlaStatus(pausedAtMinute60, windows, at(500))).toBe('ON_TRACK');
  });

  it('judges a resolved incident by when it was resolved, not by now', () => {
    const resolved = { ...base, respondedAt: at(5), resolvedAt: at(100) };
    expect(incidentSlaStatus(resolved, windows, at(1000))).toBe('ON_TRACK');
  });
});
