import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Company } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ActiveBadge } from '../../components/Badges';

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

function ResponsiblePeople({ company }: { company: Company }) {
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ['company-members', company.id],
    queryFn: () => api<{ id: string; name: string }[]>(`/companies/${company.id}/members`),
  });
  const [responsible, setResponsible] = useState(company.responsiblePerson?.id ?? '');
  const [backup, setBackup] = useState(company.backupPerson?.id ?? '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api(`/companies/${company.id}/responsible-people`, {
        method: 'PUT',
        body: { responsiblePersonId: responsible || null, backupPersonId: backup || null },
      }),
    onSuccess: () => {
      setError('');
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (e) => setError(messageOf(e)),
  });

  return (
    <div className="row" style={{ alignItems: 'flex-end' }}>
      <div style={{ minWidth: 180 }}>
        <label>Responsible person</label>
        <select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
          <option value="">None</option>
          {members.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div style={{ minWidth: 180 }}>
        <label>Backup person</label>
        <select value={backup} onChange={(e) => setBackup(e.target.value)}>
          <option value="">None</option>
          {members.data?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <button className="secondary" onClick={() => save.mutate()} disabled={save.isPending}>Save</button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

/** FR-5 (Super Admin) and FR-6 (Super Admin and Admin). */
export function CompaniesAdminPage() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = me?.role === 'SUPER_ADMIN';
  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<Company[]>('/companies') });

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['companies'] });

  const create = useMutation({
    mutationFn: () => api('/companies', { method: 'POST', body: { name, code } }),
    onSuccess: () => {
      setName('');
      setCode('');
      setError('');
      refresh();
    },
    onError: (e) => setError(messageOf(e)),
  });
  const toggle = useMutation({
    mutationFn: (c: Company) => api(`/companies/${c.id}`, { method: 'PATCH', body: { active: !c.active } }),
    onSuccess: refresh,
  });

  return (
    <>
      <h1>Companies</h1>
      {isSuper && (
        <form
          className="card"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <h2>New company</h2>
          <div className="row">
            <input placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} aria-label="Company name" />
            <input placeholder="Code (e.g. ABS)" required value={code} onChange={(e) => setCode(e.target.value)} aria-label="Company code" style={{ maxWidth: 160 }} />
            <button disabled={create.isPending}>Add</button>
          </div>
          {error && <div className="error" role="alert">{error}</div>}
        </form>
      )}

      {companies.data?.map((c) => (
        <div className="card" key={c.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{c.name} <span className="muted">({c.code})</span></h2>
            <div className="row">
              <ActiveBadge active={c.active} />
              {isSuper && <button className="secondary small" onClick={() => toggle.mutate(c)}>{c.active ? 'Deactivate' : 'Activate'}</button>}
            </div>
          </div>
          <ResponsiblePeople company={c} />
        </div>
      ))}
    </>
  );
}
