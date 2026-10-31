import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { RootCause } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ActiveBadge } from '../../components/Badges';

/** FR-29 */
export function RootCausesAdminPage() {
  const { me, companies } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = me?.role === 'SUPER_ADMIN';
  const causes = useQuery({ queryKey: ['root-causes', 'manage'], queryFn: () => api<RootCause[]>('/root-causes/manage') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['root-causes'] });

  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState(isSuper ? '' : (companies[0]?.id ?? ''));
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => api('/root-causes', { method: 'POST', body: { name, companyId: companyId || undefined } }),
    onSuccess: () => {
      setName('');
      setError('');
      refresh();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Something went wrong.'),
  });
  const toggle = useMutation({
    mutationFn: (c: RootCause) => api(`/root-causes/${c.id}`, { method: 'PATCH', body: { active: !c.active } }),
    onSuccess: refresh,
  });

  const companyName = (id: string | null) => (id ? (companies.find((c) => c.id === id)?.name ?? 'Company') : 'All companies');

  return (
    <>
      <h1>Root causes</h1>
      <form
        className="card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="row">
          <input placeholder="Root cause" required value={name} onChange={(e) => setName(e.target.value)} aria-label="Root cause name" />
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Company">
            {isSuper && <option value="">All companies</option>}
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button disabled={create.isPending}>Add</button>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
      </form>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Applies to</th><th>Status</th><th /></tr></thead>
          <tbody>
            {causes.data?.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{companyName(c.companyId)}</td>
                <td><ActiveBadge active={c.active} /></td>
                <td>{(isSuper || c.companyId) && <button className="secondary small" onClick={() => toggle.mutate(c)}>{c.active ? 'Deactivate' : 'Activate'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
