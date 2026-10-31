import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Company, Role, UserRow } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ActiveBadge } from '../../components/Badges';
import { formatDateTime } from '../../lib/format';

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

/** FR-7 / FR-8 / UC-2 */
export function UsersAdminPage() {
  const { me, companies } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = me?.role === 'SUPER_ADMIN';
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => api<UserRow[]>('/users') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'USER' as Role, companyIds: [] as string[] });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editCompanies, setEditCompanies] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: { ...form, phone: form.phone || undefined } }),
    onSuccess: () => {
      setForm({ name: '', email: '', phone: '', role: 'USER', companyIds: [] });
      setError('');
      setInfo('User created. Login details were emailed to them.');
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
    mutationFn: (u: UserRow) => api(`/users/${u.id}/reset-password`, { method: 'POST' }),
    onSuccess: () => setInfo('A new temporary password was emailed to the user.'),
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
        <button disabled={create.isPending || form.companyIds.length === 0}>Create user</button>
        {error && <div className="error" role="alert">{error}</div>}
        {info && <div className="success">{info}</div>}
      </form>

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
                <td><ActiveBadge active={u.active} /></td>
                <td className="row">
                  {(isSuper || u.role === 'USER') && u.id !== me?.id && (
                    <>
                      <button className="secondary small" onClick={() => { setEditing(u); setEditCompanies(u.companies.map((c) => c.id)); }}>Companies</button>
                      <button className="secondary small" onClick={() => { setError(''); setInfo(''); reset.mutate(u); }}>Reset password</button>
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
