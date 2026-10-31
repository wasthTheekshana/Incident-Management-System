import { BadRequestException } from '@nestjs/common';
import { validateFieldValues } from './field-values.validator';

const field = (over: Partial<Parameters<typeof validateFieldValues>[0][number]>) => ({
  key: 'f',
  label: 'Field',
  type: 'SHORT_TEXT' as const,
  options: null,
  mandatory: false,
  ...over,
});

describe('validateFieldValues', () => {
  it('accepts valid values and returns only known keys', () => {
    const out = validateFieldValues([field({ key: 'a' }), field({ key: 'n', type: 'NUMBER' })], { a: 'x', n: 4 });
    expect(out).toEqual({ a: 'x', n: 4 });
  });

  it('rejects keys that are not in the template', () => {
    expect(() => validateFieldValues([field({})], { f: 'ok', evil: 1 })).toThrow(BadRequestException);
  });

  it('enforces mandatory fields', () => {
    expect(() => validateFieldValues([field({ mandatory: true })], {})).toThrow(BadRequestException);
  });

  it('treats an unticked optional checkbox as false', () => {
    expect(validateFieldValues([field({ type: 'CHECKBOX' })], {})).toEqual({ f: false });
  });

  it('requires a mandatory checkbox to be ticked', () => {
    expect(() => validateFieldValues([field({ type: 'CHECKBOX', mandatory: true })], { f: false })).toThrow();
  });

  it('only accepts configured dropdown options', () => {
    const dropdown = field({ type: 'DROPDOWN', options: ['Low', 'High'] });
    expect(validateFieldValues([dropdown], { f: 'High' })).toEqual({ f: 'High' });
    expect(() => validateFieldValues([dropdown], { f: 'Other' })).toThrow(BadRequestException);
  });

  it('rejects numbers sent as strings and invalid dates', () => {
    expect(() => validateFieldValues([field({ type: 'NUMBER' })], { f: '5' })).toThrow();
    expect(() => validateFieldValues([field({ type: 'DATETIME' })], { f: 'not a date' })).toThrow();
  });
});
