import { averageMinutes, buildTrend, colomboDay, dayKeys, slaCompliance, topCounts } from './dashboard.calculator';

const at = (iso: string) => new Date(iso);

describe('dashboard.calculator', () => {
  it('uses the Sri Lanka calendar day, not UTC', () => {
    // 19:00 UTC on the 10th is 00:30 on the 11th in Colombo.
    expect(colomboDay(at('2026-03-10T19:00:00Z'))).toBe('2026-03-11');
  });

  it('lists consecutive days ending today', () => {
    expect(dayKeys(3, at('2026-03-10T06:00:00Z'))).toEqual(['2026-03-08', '2026-03-09', '2026-03-10']);
  });

  it('buckets created and resolved counts and ignores rows outside the window', () => {
    const now = at('2026-03-10T06:00:00Z');
    const trend = buildTrend(
      [
        { createdAt: at('2026-03-09T05:00:00Z'), resolvedAt: at('2026-03-10T05:00:00Z') },
        { createdAt: at('2026-03-09T07:00:00Z'), resolvedAt: null },
        { createdAt: at('2026-01-01T07:00:00Z'), resolvedAt: null },
      ],
      3,
      now,
    );
    expect(trend).toEqual([
      { date: '2026-03-08', created: 0, resolved: 0 },
      { date: '2026-03-09', created: 2, resolved: 0 },
      { date: '2026-03-10', created: 0, resolved: 1 },
    ]);
  });

  it('computes SLA compliance, null when nothing was resolved', () => {
    expect(slaCompliance([])).toBeNull();
    expect(
      slaCompliance([
        { resolvedAt: at('2026-03-10T10:00:00Z'), resolutionDueAt: at('2026-03-10T11:00:00Z') },
        { resolvedAt: at('2026-03-10T12:00:00Z'), resolutionDueAt: at('2026-03-10T11:00:00Z') },
        { resolvedAt: at('2026-03-10T11:00:00Z'), resolutionDueAt: at('2026-03-10T11:00:00Z') },
      ]),
    ).toBe(66.7);
  });

  it('averages elapsed minutes minus paused time', () => {
    expect(averageMinutes([])).toBeNull();
    expect(
      averageMinutes([
        { start: at('2026-03-10T00:00:00Z'), end: at('2026-03-10T02:00:00Z'), pausedMinutes: 60 },
        { start: at('2026-03-10T00:00:00Z'), end: at('2026-03-10T01:00:00Z') },
      ]),
    ).toBe(60);
  });

  it('folds the tail into Other', () => {
    const counts = new Map([
      ['a', 5],
      ['b', 3],
      ['c', 2],
      ['d', 1],
    ]);
    expect(topCounts(counts, 2)).toEqual([
      { name: 'a', count: 5 },
      { name: 'b', count: 3 },
      { name: 'Other', count: 3 },
    ]);
  });
});
