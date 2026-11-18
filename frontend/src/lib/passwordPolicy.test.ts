import { describe, expect, it } from 'vitest';
import { evaluate, generatePassword, meetsPolicy } from './passwordPolicy';

const unmet = (password: string, identity = {}) => evaluate(password, identity).filter((r) => !r.ok).map((r) => r.id);

describe('evaluate', () => {
  it('accepts a password with every required kind of character', () => {
    expect(unmet('Abcdef@1234')).toEqual([]);
  });

  it('names each missing rule, in the same terms as the server', () => {
    expect(unmet('abcdefghij')).toEqual(['upper', 'digit', 'special']);
    expect(unmet('ABCDEFGHIJ1!')).toEqual(['lower']);
    expect(unmet('Ab1!')).toEqual(['length']);
    expect(unmet('Abcdefghij1')).toEqual(['special']);
  });

  it('uses the minimum length it is given', () => {
    expect(evaluate('Abcdef@1', {}, 8).every((r) => r.ok)).toBe(true);
    expect(evaluate('Abcdef@1', {}, 12).find((r) => r.id === 'length')?.ok).toBe(false);
  });

  it('rejects the account name or a name part, ignoring case and fragments under three letters', () => {
    const identity = { email: 'nimal.perera@company.lk', name: 'Nimal Perera' };
    expect(unmet('Xx-Nimal.perera-1', identity)).toContain('identity');
    expect(unmet('Zq9$PERERA$w8', identity)).toContain('identity');
    expect(unmet('Zq9$Kandy$w8', identity)).toEqual([]);
    expect(unmet('Xyz-Jo-1234-Ab', { name: 'Jo Ab' })).toEqual([]);
  });
});

describe('generatePassword', () => {
  it('always satisfies the policy', () => {
    for (let i = 0; i < 300; i++) expect(meetsPolicy(generatePassword())).toBe(true);
  });

  it('is random and as long as asked', () => {
    expect(generatePassword(20)).toHaveLength(20);
    expect(new Set(Array.from({ length: 40 }, () => generatePassword())).size).toBe(40);
  });
});
