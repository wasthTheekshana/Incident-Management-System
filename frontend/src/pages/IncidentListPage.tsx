import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, download } from '../api/client';
import type { IncidentListItem, Paged, Priority, Stage, Template, UserRow } from '../api/types';
import { isAdminRole, useAuth } from '../auth/AuthContext';
import { PriorityBadge, SlaBadge, StageBadge } from '../components/Badges';
import { Pager } from '../components/Pager';
import { formatDateTime, PRIORITY_LABEL, STAGE_LABEL } from '../lib/format';

const PAGE_SIZE = 25;

interface Filters {
  search: string;
  priority: string;
  stage: string;
  assigneeId: string;
  templateId: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { search: '', priority: '', stage: '', assigneeId: '', templateId: '', from: '', to: '' };

/** FR-34 / FR-37 */
export function IncidentListPage() {
  const { me, activeCompany } = useAuth();
  const navigate = useNavigate();
  const admin = isAdminRole(me);
  const companyId = activeCompany?.id;

  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);

  const query = {
    ...applied,
    companyId,
    // Date inputs are Sri Lanka calendar days; send them as full-day UTC instants.
    from: applied.from ? new Date(`${applied.from}T00:00:00+05:30`).toISOString() : undefined,
    to: applied.to ? new Date(`${applied.to}T23:59:59+05:30`).toISOString() : undefined,
  };

  const list = useQuery({
    queryKey: ['incidents', 'list', query, page],
    queryFn: () => api<Paged<IncidentListItem>>('/incidents', { query: { ...query, page, pageSize: PAGE_SIZE } }),
  });
  const templates = useQuery({
    queryKey: ['templates', 'available', companyId],
    queryFn: () => api<Template[]>('/templates/available', { query: { companyId } }),
    enabled: !!companyId,
  });
  const users = useQuery({
    queryKey: ['users', companyId],
    queryFn: () => api<UserRow[]>('/users', { query: { companyId } }),
    enabled: admin && !!companyId,
  });

  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <>
      <div className="topbar">
        <h1>Incidents</h1>
        {admin && (
          <div className="page-actions">
            <button className="secondary" onClick={() => download('/incidents/export', { ...query, format: 'xlsx' })}>Export Excel</button>
            <button className="secondary" onClick={() => download('/incidents/export', { ...query, format: 'csv' })}>Export CSV</button>
          </div>
        )}
      </div>

      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(draft);
          setPage(1);
        }}
      >
        <div className="filters">
          <input placeholder="Search number, title, text" value={draft.search} onChange={set('search')} aria-label="Search" />
          <select value={draft.priority} onChange={set('priority')} aria-label="Priority">
            <option value="">All priorities</option>
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
          <select value={draft.stage} onChange={set('stage')} aria-label="Stage">
            <option value="">All stages</option>
            {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
          <select value={draft.templateId} onChange={set('templateId')} aria-label="Template">
            <option value="">All templates</option>
            {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {admin && (
            <select value={draft.assigneeId} onChange={set('assigneeId')} aria-label="Assignee">
              <option value="">All assignees</option>
              {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <input type="date" value={draft.from} onChange={set('from')} aria-label="From date" />
          <input type="date" value={draft.to} onChange={set('to')} aria-label="To date" />
        </div>
        <div className="row">
          <button>Apply filters</button>
          <button type="button" className="secondary" onClick={() => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); }}>Clear</button>
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Number</th><th>Title</th><th>Company</th><th>Template</th><th>Priority</th>
              <th>Stage</th><th>Assignee</th><th>Created</th><th>SLA</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => navigate(`/incidents/${i.id}`)}>
                <td><Link to={`/incidents/${i.id}`} onClick={(e) => e.stopPropagation()}>{i.number}</Link></td>
                <td>{i.title}</td>
                <td>{i.company.code}</td>
                <td>{i.template.name}</td>
                <td><PriorityBadge priority={i.priority} /></td>
                <td><StageBadge stage={i.stage} /></td>
                <td>{i.assignee?.name ?? <span className="muted">Unassigned</span>}</td>
                <td>{formatDateTime(i.createdAt)}</td>
                <td><SlaBadge status={i.slaStatus} /></td>
              </tr>
            ))}
            {list.data?.items.length === 0 && <tr><td colSpan={9} className="muted">No incidents match.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onChange={setPage} />}
      {list.error && <div className="error">Could not load incidents.</div>}
    </>
  );
}
