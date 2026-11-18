import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  afterFailedLogin,
  canChangePassword,
  evaluatePassword,
  isLocked,
  isPasswordExpired,
  LOCKED_INDEFINITELY,
  PASSWORD_POLICY,
  unmetRules,
} from './password.policy';
import { PasswordService } from './password.service';

const at = (iso: string) => new Date(iso);
const ids = (plain: string, identity = {}) => unmetRules(plain, identity).map((r) => r.id);

describe('password rules', () => {
  it('accepts a password with every required kind of character', () => {
    expect(ids('Abcdef@1234')).toEqual([]);
  });

  it('names each missing rule', () => {
    expect(ids('abcdefghij')).toEqual(['upper', 'digit', 'special']);
    expect(ids('ABCDEFGHIJ1!')).toEqual(['lower']);
    expect(ids('Ab1!')).toEqual(['length']);
    expect(ids('Abcdefghij1')).toEqual(['special']);
  });

  it('requires the minimum length from the policy', () => {
    const nine = 'Abcdef@12';
    expect(nine).toHaveLength(PASSWORD_POLICY.minLength - 1);
    expect(ids(nine)).toEqual(['length']);
    expect(ids(`${nine}3`)).toEqual([]);
  });

  it('treats any non-alphanumeric character as special', () => {
    expect(ids('Abcdefgh12-')).toEqual([]);
    expect(ids('Abcdefgh12 ')).toEqual([]);
  });

  it('rejects passwords containing the email name or a name part (case-insensitive)', () => {
    const identity = { email: 'nimal.perera@company.lk', name: 'Nimal Perera' };
    expect(ids('Xx-Nimal.perera-1', identity)).toContain('identity');
    expect(ids('Zq9$PERERA$w8', identity)).toContain('identity');
    expect(ids('Zq9$Kandy$w8', identity)).toEqual([]);
  });

  it('ignores name fragments shorter than three characters', () => {
    expect(ids('Xyz-Jo-1234-Ab', { name: 'Jo Ab' })).toEqual([]);
  });

  it('reports every rule so the screen can show a checklist', () => {
    expect(evaluatePassword('x').map((r) => r.id)).toEqual(['length', 'lower', 'upper', 'digit', 'special', 'identity']);
  });
});

describe('account lockout', () => {
  const now = at('2026-11-18T10:00:00Z');

  it('counts failures inside the reset window and locks at the threshold', () => {
    let state = { failedLoginAttempts: 0, lastFailedLoginAt: null as Date | null };
    const results = [];
    for (let i = 0; i < PASSWORD_POLICY.lockoutThreshold; i++) {
      const out = afterFailedLogin(state, new Date(now.getTime() + i * 60_000));
      results.push(out.locked);
      state = out;
    }
    expect(results).toEqual([false, false, true]);
    expect(state.failedLoginAttempts).toBe(0);
  });

  it('locks until an administrator unlocks, not for a limited time', () => {
    const out = afterFailedLogin({ failedLoginAttempts: 2, lastFailedLoginAt: now }, now);
    expect(out.lockedUntil).toEqual(LOCKED_INDEFINITELY);
    expect(isLocked({ lockedUntil: out.lockedUntil }, at('2090-01-01T00:00:00Z'))).toBe(true);
  });

  it('starts counting again once the reset window has passed', () => {
    const later = new Date(now.getTime() + (PASSWORD_POLICY.lockoutCounterResetMinutes * 60 + 1) * 1000);
    const out = afterFailedLogin({ failedLoginAttempts: 2, lastFailedLoginAt: now }, later);
    expect(out).toMatchObject({ failedLoginAttempts: 1, locked: false, lockedUntil: null });
  });

  it('does not report an unlocked account as locked', () => {
    expect(isLocked({ lockedUntil: null }, now)).toBe(false);
    expect(isLocked({ lockedUntil: at('2026-11-18T09:00:00Z') }, now)).toBe(false);
  });
});

describe('password age', () => {
  const changed = at('2026-01-01T00:00:00Z');

  it('expires after the maximum age', () => {
    expect(isPasswordExpired(changed, at('2026-04-01T00:00:00Z'))).toBe(false);
    expect(isPasswordExpired(changed, at('2026-04-02T00:00:01Z'))).toBe(true);
  });

  it('blocks a second change within the minimum age', () => {
    expect(canChangePassword(changed, at('2026-01-01T23:59:59Z'))).toBe(false);
    expect(canChangePassword(changed, at('2026-01-02T00:00:00Z'))).toBe(true);
  });
});

describe('PasswordService', () => {
  let service: PasswordService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [PasswordService, { provide: PrismaService, useValue: {} }],
    }).compile();
    service = module.get(PasswordService);
  });

  it('always generates a password that satisfies the policy', () => {
    for (let i = 0; i < 500; i++) expect(unmetRules(service.generateTemporary())).toEqual([]);
  });

  it('generates different passwords each time', () => {
    expect(new Set(Array.from({ length: 50 }, () => service.generateTemporary())).size).toBe(50);
  });

  it('explains every unmet rule when rejecting a password', () => {
    expect(() => service.assertPolicy('short')).toThrow(/at least 10 characters.*capital letter.*number.*special character/s);
    expect(() => service.assertPolicy('Abcdef@1234')).not.toThrow();
  });
});
