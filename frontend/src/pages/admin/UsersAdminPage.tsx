import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Company, CreatedUser, Role, UserRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ActiveBadge } from '../../components/Badges';
import { usePasswordPolicy } from '../../components/PasswordChecklist';
import { EMPTY_TEMP, TempPassword, TempPasswordFields } from '../../components/TempPasswordFields';
import { formatDateTime } from '../../lib/format';
import { meetsPolicy } from '../../lib/passwordPolicy';

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');
const ROLE_LABEL: Record<Role, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', USER: 'User' };

function CompanyChecklist({ companies, value, onChange }: { companies: Company[]; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div>
      {companies.map((c) => (
        <label key={c.id} style={{ fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={value.includes(c.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((id) => id !== c.id))}
          />
          {c.name}
        </label>
      ))}
    </div>
  );
}

interface Issued {
  name: string;
  email: string;
  password: string;
}

/** The temporary password, shown once. It is never stored in clear text, so this is the only chance to read it. */
function IssuedPassword({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
    } catch {
      /* clipboard unavailable: the password is still on screen to copy by hand */
    }
  }
  return (
    <div className="card issued" role="status">
      <h2>Temporary password for {issued.name}</h2>
      <p className="muted">
        Give this to {issued.email} through a safe channel. It is shown only now, and they must change it the first time
        they sign in. An email with the same details was also sent if mail is set up.
      </p>
      <div className="row">
        <code className="secret">{issued.password}</code>
        <button type="button" className="secondary small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" className="secondary small" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

/** FR-7 / FR-8 / UC-2 */
export function UsersAdminPage() {
  const { me, companies } = useAuth();
  const queryClient = useQueryClient();
  const policy = usePasswordPolicy();
  const isSuper = me?.role === 'SUPER_ADMIN';
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => api<UserRow[]>('/users') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'USER' as Role, companyIds: [] as string[] });
  const [temp, setTemp] = useState<TempPassword>(EMPTY_TEMP);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [issued, setIssued] = useState<Issued | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editCompanies, setEditCompanies] = useState<string[]>([]);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [resetTemp, setResetTemp] = useState<TempPassword>(EMPTY_TEMP);

  const tempProblem = (t: TempPassword, identity: { name: string; email: string }) =>
    t.password.length > 0 && (t.password !== t.repeat || !meetsPolicy(t.password, identity, policy.minLength));

  const create = useMutation({
    mutationFn: () =>
      api<CreatedUser>('/users', {
        method: 'POST',
        body: { ...form, phone: form.phone || undefined, temporaryPassword: temp.password || undefined },
      }),
    onSuccess: (created) => {
      setIssued({ name: created.name, email: created.email, password: created.temporaryPassword });
      setForm({ name: '', email: '', phone: '', role: 'USER', companyIds: [] });
      setTemp(EMPTY_TEMP);
      setError('');
      setInfo('');
      refresh();
    },
    onError: (e) => {
      setInfo('');
      setError(messageOf(e));
    },
  });
  const toggle = useMutation({
    mutationFn: (u: UserRow) => api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }),
    onSuccess: refresh,
    onError: (e) => setError(messageOf(e)),
  });
  const reset = useMutation({
    mutationFn: (u: UserRow) =>
      api<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`, {
        method: 'POST',
        body: resetTemp.password ? { temporaryPassword: resetTemp.password } : {},
      }),
    onSuccess: (result, u) => {
      setIssued({ name: u.name, email: u.email, password: result.temporaryPassword });
      setResetting(null);
      setResetTemp(EMPTY_TEMP);
      setError('');
      setInfo('');
      refresh();
    },
    onError: (e) => setError(messageOf(e)),
  });
  const unlock = useMutation({
    mutationFn: (u: UserRow) => api(`/users/${u.id}/unlock`, { method: 'POST' }),
    onSuccess: (_, u) => {
      setError('');
      setInfo(`${u.name} can sign in again.`);
      refresh();
    },
    onError: (e) => setError(messageOf(e)),
  });
  const saveCompanies = useMutation({
    mutationFn: () => api(`/users/${editing!.id}`, { method: 'PATCH', body: { companyIds: editCompanies } }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (e) => setError(messageOf(e)),
  });

  return (
    <>
      <h1>Users</h1>
      <form
        className="card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2>New user</h2>
        <div className="grid cols-2">
          <div className="field"><label htmlFor="u-name">Name</label><input id="u-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="u-email">Email</label><input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label htmlFor="u-phone">Contact number</label><input id="u-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="field">
            <label htmlFor="u-role">Role</label>
            <select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="USER">User</option>
              {isSuper && <option value="ADMIN">Admin</option>}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Companies</label>
          <CompanyChecklist companies={companies} value={form.companyIds} onChange={(companyIds) => setForm({ ...form, companyIds })} />
        </div>
        <TempPasswordFields value={temp} onChange={setTemp} identity={{ name: form.name, email: form.email }} idPrefix="new-user" />
        <button disabled={create.isPending || form.companyIds.length === 0 || tempProblem(temp, form)}>Create user</button>
        {error && <div className="error" role="alert">{error}</div>}
        {info && <div className="success">{info}</div>}
      </form>

      {issued && <IssuedPassword issued={issued} onClose={() => setIssued(null)} />}

      {resetting && (
        <form
          className="card"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            reset.mutate(resetting);
          }}
        >
          <h2>Reset password for {resetting.name}</h2>
          <p className="muted">They are signed out and must choose a new password at their next sign-in.</p>
          <TempPasswordFields value={resetTemp} onChange={setResetTemp} identity={{ name: resetting.name, email: resetting.email }} idPrefix="reset" />
          <div className="row">
            <button disabled={reset.isPending || tempProblem(resetTemp, resetting)}>Reset password</button>
            <button type="button" className="secondary" onClick={() => { setResetting(null); setResetTemp(EMPTY_TEMP); }}>Cancel</button>
          </div>
        </form>
      )}

      {editing && (
        <div className="card">
          <h2>Companies for {editing.name}</h2>
          <CompanyChecklist companies={companies} value={editCompanies} onChange={setEditCompanies} />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={() => saveCompanies.mutate()} disabled={editCompanies.length === 0}>Save</button>
            <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Companies</th><th>Last login</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{u.companies.map((c) => c.code).join(', ')}</td>
                <td>{formatDateTime(u.lastLoginAt)}</td>
                <td>
                  <ActiveBadge active={u.active} /> {u.locked && <span className="badge BREACHED">Locked</span>}
                </td>
                <td className="row">
                  {(isSuper || u.role === 'USER') && u.id !== me?.id && (
                    <>
                      {u.locked && <button className="small" onClick={() => { setError(''); setInfo(''); unlock.mutate(u); }}>Unlock</button>}
                      <button className="secondary small" onClick={() => { setEditing(u); setEditCompanies(u.companies.map((c) => c.id)); }}>Companies</button>
                      <button className="secondary small" onClick={() => { setError(''); setInfo(''); setResetTemp(EMPTY_TEMP); setResetting(u); }}>Reset password</button>
                      <button className="secondary small" onClick={() => toggle.mutate(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
