import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Template } from '../../api/types';
import { ActiveBadge, PriorityBadge } from '../../components/Badges';

export function TemplatesAdminPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const templates = useQuery({ queryKey: ['templates', 'admin'], queryFn: () => api<Template[]>('/templates') });

  const copy = useMutation({
    mutationFn: (id: string) => api<Template>(`/templates/${id}/copy`, { method: 'POST' }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      navigate(`/admin/templates/${t.id}`);
    },
  });

  return (
    <>
      <div className="topbar">
        <h1>Incident templates</h1>
        <Link className="btn" to="/admin/templates/new">New template</Link>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Companies</th><th>Default priority</th><th>Fields</th><th>Version</th><th>Status</th><th /></tr></thead>
          <tbody>
            {templates.data?.map((t) => (
              <tr key={t.id}>
                <td><Link to={`/admin/templates/${t.id}`}>{t.name}</Link></td>
                <td>{t.companies.map((c) => c.code).join(', ')}</td>
                <td><PriorityBadge priority={t.defaultPriority} /></td>
                <td>{t.fields.length}</td>
                <td>v{t.version}</td>
                <td><ActiveBadge active={t.active} /></td>
                <td><button className="secondary small" onClick={() => copy.mutate(t.id)}>Copy</button></td>
              </tr>
            ))}
            {templates.data?.length === 0 && <tr><td colSpan={7} className="muted">No templates yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
