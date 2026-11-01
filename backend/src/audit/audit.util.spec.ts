import { ROUTE_LABELS, sanitizeBody } from './audit.util';

describe('sanitizeBody', () => {
  it('keeps short scalar fields', () => {
    expect(sanitizeBody({ stage: 'RESOLVED', count: 3, flag: true })).toEqual({ stage: 'RESOLVED', count: 3, flag: true });
  });

  it('never keeps secrets, whatever the key casing', () => {
    const out = sanitizeBody({ password: 'x', newPassword: 'y', Token: 'z', apiSecret: 's', name: 'ok' });
    expect(out).toEqual({ name: 'ok' });
  });

  it('drops nested values and truncates long text', () => {
    const out = sanitizeBody({ fieldValues: { a: 1 }, list: [1], note: 'a'.repeat(300) });
    expect(Object.keys(out)).toEqual(['note']);
    expect(out.note).toHaveLength(121);
  });

  it('copes with non-object bodies', () => {
    expect(sanitizeBody(undefined)).toEqual({});
    expect(sanitizeBody('text')).toEqual({});
    expect(sanitizeBody([1, 2])).toEqual({});
  });

  it('caps the number of fields', () => {
    const body = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(sanitizeBody(body))).toHaveLength(8);
  });
});

describe('ROUTE_LABELS', () => {
  it('gives every entry a unique action name', () => {
    const actions = Object.values(ROUTE_LABELS).map((l) => l.action);
    expect(new Set(actions).size).toBe(actions.length);
  });
});
