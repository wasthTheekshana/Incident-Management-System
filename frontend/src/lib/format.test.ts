import { describe, expect, it } from 'vitest';
import { formatDateTime, formatMinutes, fromMinutes, toMinutes } from './format';

describe('formatMinutes', () => {
  it('uses the largest whole unit', () => {
    expect(formatMinutes(15)).toBe('15 min');
    expect(formatMinutes(240)).toBe('4 hrs');
    expect(formatMinutes(60)).toBe('1 hr');
    expect(formatMinutes(2880)).toBe('2 days');
  });
});

describe('minute conversion', () => {
  it('round-trips between the form units and stored minutes', () => {
    expect(toMinutes(2, 'day')).toBe(2880);
    expect(fromMinutes(2880)).toEqual({ value: 2, unit: 'day' });
    expect(fromMinutes(90)).toEqual({ value: 90, unit: 'min' });
  });
});

describe('formatDateTime', () => {
  it('shows UTC instants in Sri Lanka time (UTC+05:30)', () => {
    expect(formatDateTime('2026-10-20T10:00:00Z')).toContain('15:30');
  });
  it('shows a dash when empty', () => {
    expect(formatDateTime(null)).toBe('—');
  });
});
