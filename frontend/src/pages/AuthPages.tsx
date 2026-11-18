import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../components/Icon';
import { PasswordChecklist, usePasswordPolicy } from '../components/PasswordChecklist';
import { meetsPolicy } from '../lib/passwordPolicy';

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand">
          <BrandMark size={34} />
          <div>
            <div className="brand-name">CIMS</div>
            <div className="brand-sub">Centralized Incident Management System</div>
          </div>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p><Link to="/forgot-password">Forgot password?</Link></p>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email } });
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <AuthCard title="Reset password">
      {done ? (
        <p>If that email belongs to an active account, a reset link has been sent. It expires in 30 minutes.</p>
      ) : (
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          <button style={{ width: '100%' }}>Send reset link</button>
        </form>
      )}
      <p><Link to="/login">Back to sign in</Link></p>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const policy = usePasswordPolicy();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: password } });
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <p>Your password was changed. <Link to="/login">Sign in</Link></p>
      ) : (
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="pw">New password</label>
            <input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <PasswordChecklist password={password} />
          {error && <div className="error" role="alert">{error}</div>}
          <button style={{ width: '100%' }} disabled={!meetsPolicy(password, {}, policy.minLength)}>Change password</button>
        </form>
      )}
    </AuthCard>
  );
}

export function ChangePasswordPage() {
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const policy = usePasswordPolicy();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setError('New passwords do not match');
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <AuthCard title="Change password">
      {me?.mustChangePassword && <p>Choose your own password before continuing. The one you were given is temporary.</p>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="cur">Current password</label>
          <input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="new">New password</label>
          <input id="new" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="conf">Confirm new password</label>
          <input id="conf" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={confirm.length > 0 && next !== confirm} />
          {confirm.length > 0 && next !== confirm && <small className="error">The two passwords do not match.</small>}
        </div>
        <PasswordChecklist password={next} identity={{ email: me?.email, name: me?.name }} />
        {error && <div className="error" role="alert">{error}</div>}
        <button
          style={{ width: '100%' }}
          disabled={!meetsPolicy(next, { email: me?.email, name: me?.name }, policy.minLength) || next !== confirm}
        >
          Change password
        </button>
      </form>
      {!me?.mustChangePassword && <p><Link to="/">Cancel</Link></p>}
    </AuthCard>
  );
}
