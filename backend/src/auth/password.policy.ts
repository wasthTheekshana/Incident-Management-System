/**
 * The password and lockout policy, in one place. Source: docs/Password Policies.pdf. Where that document lists
 * different values for different systems, the Active Directory settings are used (they are the strictest that apply
 * to user accounts) together with the four-rule checklist from its create-user screen. See docs/password-policy.md.
 *
 * Pure functions only, so every rule is unit-tested without a database.
 */
export const PASSWORD_POLICY = {
  /** AD "Minimum password length" (the sample screen asks for 8; 10 satisfies both). */
  minLength: 10,
  maxLength: 128,
  /** AD "Enforce password history": 3 passwords remembered. */
  historyCount: 3,
  /** AD "Maximum password age": 90 days. */
  maxAgeDays: 90,
  /** AD "Minimum password age": 1 day. */
  minAgeDays: 1,
  /** AD "Account lockout threshold": 3 invalid logon attempts. */
  lockoutThreshold: 3,
  /** AD "Reset account lockout counter after": 5 minutes. */
  lockoutCounterResetMinutes: 5,
} as const;

/** AD "Account lockout duration: 0" means locked until an administrator unlocks. Stored as a far-future date. */
export const LOCKED_INDEFINITELY = new Date('9999-12-31T00:00:00.000Z');

export type RuleId = 'length' | 'lower' | 'upper' | 'digit' | 'special' | 'identity';

export interface RuleResult {
  id: RuleId;
  label: string;
  ok: boolean;
}

export interface Identity {
  email?: string;
  name?: string;
}

const MIN_IDENTITY_PART = 3;
const DAY_MS = 86_400_000;

/** Parts of the account name that must not appear in the password (AD complexity: no account or full-name parts). */
function identityParts({ email, name }: Identity): string[] {
  const parts = [email?.split('@')[0] ?? '', ...(name ?? '').split(/[\s._-]+/)];
  return parts.map((p) => p.trim().toLowerCase()).filter((p) => p.length >= MIN_IDENTITY_PART);
}

export function evaluatePassword(plain: string, identity: Identity = {}): RuleResult[] {
  const lower = plain.toLowerCase();
  return [
    { id: 'length', label: `At least ${PASSWORD_POLICY.minLength} characters`, ok: plain.length >= PASSWORD_POLICY.minLength },
    { id: 'lower', label: 'A lowercase letter (a-z)', ok: /[a-z]/.test(plain) },
    { id: 'upper', label: 'A capital letter (A-Z)', ok: /[A-Z]/.test(plain) },
    { id: 'digit', label: 'A number (0-9)', ok: /[0-9]/.test(plain) },
    { id: 'special', label: 'A special character (for example $ @ ! % * # ? &)', ok: /[^A-Za-z0-9]/.test(plain) },
    { id: 'identity', label: 'Does not contain your name or email', ok: !identityParts(identity).some((p) => lower.includes(p)) },
  ];
}

export const unmetRules = (plain: string, identity: Identity = {}): RuleResult[] =>
  evaluatePassword(plain, identity).filter((r) => !r.ok);

export interface FailureState {
  failedLoginAttempts: number;
  lastFailedLoginAt: Date | null;
}

export interface FailureOutcome {
  failedLoginAttempts: number;
  lastFailedLoginAt: Date;
  lockedUntil: Date | null;
  locked: boolean;
}

/**
 * Applies one failed sign-in. The counter starts again when the previous failure is older than the reset window,
 * and the account locks (until an administrator unlocks it) when the threshold is reached.
 */
export function afterFailedLogin(state: FailureState, now: Date): FailureOutcome {
  const windowMs = PASSWORD_POLICY.lockoutCounterResetMinutes * 60_000;
  const stale = !state.lastFailedLoginAt || now.getTime() - state.lastFailedLoginAt.getTime() > windowMs;
  const attempts = (stale ? 0 : state.failedLoginAttempts) + 1;
  const locked = attempts >= PASSWORD_POLICY.lockoutThreshold;
  return {
    failedLoginAttempts: locked ? 0 : attempts,
    lastFailedLoginAt: now,
    lockedUntil: locked ? LOCKED_INDEFINITELY : null,
    locked,
  };
}

export const isLocked = (user: { lockedUntil: Date | null }, now: Date): boolean =>
  user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();

/** AD "Maximum password age": the password must be changed once it is older than 90 days. */
export const isPasswordExpired = (changedAt: Date, now: Date): boolean =>
  now.getTime() - changedAt.getTime() > PASSWORD_POLICY.maxAgeDays * DAY_MS;

/** AD "Minimum password age": a voluntary change is refused within a day of the previous one. */
export const canChangePassword = (changedAt: Date, now: Date): boolean =>
  now.getTime() - changedAt.getTime() >= PASSWORD_POLICY.minAgeDays * DAY_MS;
