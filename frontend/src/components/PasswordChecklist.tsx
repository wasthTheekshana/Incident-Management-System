import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { DEFAULT_POLICY, evaluate, Identity, PasswordPolicy } from '../lib/passwordPolicy';

/** The server's password numbers (length, history, expiry). Public, so the sign-in and reset pages can use it too. */
export function usePasswordPolicy(): PasswordPolicy {
  const { data } = useQuery({
    queryKey: ['password-policy'],
    queryFn: () => api<PasswordPolicy>('/auth/password-policy'),
    staleTime: Infinity,
  });
  return data ?? DEFAULT_POLICY;
}

/** Live checklist of the password rules, ticked as the person types (the "Password must contain" box). */
export function PasswordChecklist({ password, identity }: { password: string; identity?: Identity }) {
  const policy = usePasswordPolicy();
  const rules = evaluate(password, identity, policy.minLength);
  const started = password.length > 0;
  return (
    <div className="pw-rules" aria-live="polite">
      <strong>Password must contain the following:</strong>
      <ul>
        {rules.map((rule) => (
          <li key={rule.id} className={!started ? '' : rule.ok ? 'ok' : 'bad'}>
            <span className="mark" aria-hidden="true">{!started ? '•' : rule.ok ? '✓' : '✕'}</span>
            {rule.label}
            {started && <span className="sr-only">{rule.ok ? ' (met)' : ' (not met)'}</span>}
          </li>
        ))}
      </ul>
      <small className="muted">
        You cannot reuse your last {policy.historyCount} passwords. Passwords expire after {policy.maxAgeDays} days.
      </small>
    </div>
  );
}
