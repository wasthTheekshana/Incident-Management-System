import { useState } from 'react';
import { generatePassword, Identity } from '../lib/passwordPolicy';
import { PasswordChecklist } from './PasswordChecklist';

export interface TempPassword {
  password: string;
  repeat: string;
}

export const EMPTY_TEMP: TempPassword = { password: '', repeat: '' };

/**
 * Temporary password for a new or reset account. Both fields empty means "let the system generate one"; otherwise the
 * rules apply. Generate fills both fields and shows the result so the admin can read it out.
 */
export function TempPasswordFields({
  value,
  onChange,
  identity,
  idPrefix,
}: {
  value: TempPassword;
  onChange: (next: TempPassword) => void;
  identity: Identity;
  idPrefix: string;
}) {
  const [shown, setShown] = useState(false);
  const mismatch = value.repeat.length > 0 && value.password !== value.repeat;

  return (
    <div className="pw-block">
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor={`${idPrefix}-pw`}>Temporary password</label>
          <input
            id={`${idPrefix}-pw`}
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            spellCheck={false}
            value={value.password}
            onChange={(e) => onChange({ ...value, password: e.target.value })}
            placeholder="Leave empty to generate one"
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-repeat`}>Repeat password</label>
          <input
            id={`${idPrefix}-repeat`}
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            spellCheck={false}
            value={value.repeat}
            onChange={(e) => onChange({ ...value, repeat: e.target.value })}
            aria-invalid={mismatch}
          />
          {mismatch && <small className="error">The two passwords do not match.</small>}
        </div>
      </div>
      <div className="row">
        <button
          type="button"
          className="secondary small"
          onClick={() => {
            const generated = generatePassword();
            onChange({ password: generated, repeat: generated });
            setShown(true);
          }}
        >
          Generate password
        </button>
        <button type="button" className="secondary small" onClick={() => setShown((s) => !s)}>
          {shown ? 'Hide' : 'Show'}
        </button>
        <small className="muted">The user must change it at first login.</small>
      </div>
      {value.password.length > 0 && <PasswordChecklist password={value.password} identity={identity} />}
    </div>
  );
}
