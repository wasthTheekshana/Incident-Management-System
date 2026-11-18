/**
 * The password rules as shown on screen. The server enforces the same rules (backend/src/auth/password.policy.ts); this
 * copy only gives instant feedback while typing. The minimum length comes from the server (/auth/password-policy).
 */
export interface PasswordPolicy {
  minLength: number;
  historyCount: number;
  maxAgeDays: number;
  minAgeDays: number;
  lockoutThreshold: number;
}

/** Used until the server's numbers arrive. */
export const DEFAULT_POLICY: PasswordPolicy = { minLength: 10, historyCount: 3, maxAgeDays: 90, minAgeDays: 1, lockoutThreshold: 3 };

export interface Identity {
  email?: string;
  name?: string;
}

export interface Rule {
  id: 'length' | 'lower' | 'upper' | 'digit' | 'special' | 'identity';
  label: string;
  ok: boolean;
}

const MIN_IDENTITY_PART = 3;

function identityParts({ email, name }: Identity): string[] {
  const parts = [email?.split('@')[0] ?? '', ...(name ?? '').split(/[\s._-]+/)];
  return parts.map((p) => p.trim().toLowerCase()).filter((p) => p.length >= MIN_IDENTITY_PART);
}

export function evaluate(password: string, identity: Identity = {}, minLength = DEFAULT_POLICY.minLength): Rule[] {
  const lower = password.toLowerCase();
  return [
    { id: 'length', label: `At least ${minLength} characters`, ok: password.length >= minLength },
    { id: 'lower', label: 'A lowercase letter (a-z)', ok: /[a-z]/.test(password) },
    { id: 'upper', label: 'A capital letter (A-Z)', ok: /[A-Z]/.test(password) },
    { id: 'digit', label: 'A number (0-9)', ok: /[0-9]/.test(password) },
    { id: 'special', label: 'A special character (for example $ @ ! % * # ? &)', ok: /[^A-Za-z0-9]/.test(password) },
    { id: 'identity', label: 'Does not contain your name or email', ok: !identityParts(identity).some((p) => lower.includes(p)) },
  ];
}

export const meetsPolicy = (password: string, identity: Identity = {}, minLength = DEFAULT_POLICY.minLength): boolean =>
  evaluate(password, identity, minLength).every((r) => r.ok);

// Look-alike characters are left out so a password can be read out or typed without mistakes.
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SPECIAL = '$@!%*#?&';

/** A random password that satisfies every rule, for the "Generate" button. Uses the browser's secure random source. */
export function generatePassword(length = 14): string {
  const randomInt = (max: number): number => {
    // Rejection sampling keeps the choice unbiased.
    const limit = Math.floor(0x1_0000_0000 / max) * max;
    const buffer = new Uint32Array(1);
    do crypto.getRandomValues(buffer);
    while (buffer[0] >= limit);
    return buffer[0] % max;
  };
  const pick = (set: string) => set[randomInt(set.length)];
  const all = LOWER + UPPER + DIGITS + SPECIAL;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
