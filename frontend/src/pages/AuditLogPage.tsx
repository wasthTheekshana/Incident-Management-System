import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { AuditEntry, Paged, UserRow } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Pager } from '../components/Pager';
import { formatDateTime } from '../lib/format';

const PAGE_SIZE = 25;

interface Filters {
  search: string;
  action: string;
  actorId: string;
  companyId: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { search: '', action: '', actorId: '', companyId: '', from: '', to: '' };

/** "incident.stage_changed" -> "Incident: stage changed" */
export function actionLabel(action: string): string {
  const [area, ...rest] = action.split('.');
  const what = rest.join(' ').replace(/_/g, ' ');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return what ? `${cap(area.replace(/_/g, ' '))}: ${what}` : cap(area);
}

/** Tone of the dot beside an action so security-relevant rows stand out when scanning. */
function tone(action: string): string {
  if (action === 'auth.login_failed') return 'BREACHED';
  if (action.startsWith('auth.password') || action === 'user.password_reset') return 'DUE_SOON';
  if (action === 'auth.login' || action === 'auth.logout') return 'off';
  return 'ON_TRACK';
}

/** Admin / Super Admin: who did what, across the whole system. The server decides which entries each role sees. */
export function AuditLogPage() {
  const { me, companies } = useAuth();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);

  const query = {
    ...applied,
    from: applied.from ? new Date(`${applied.from}T00:00:00+05:30`).toISOString() : undefined,
    to: applied.to ? new Date(`${applied.to}T23:59:59+05:30`).toISOString() : undefined,
  };

  const list = useQuery({
    queryKey: ['audit', query, page],
    queryFn: () => api<Paged<AuditEntry>>('/audit', { query: { ...query, page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });
  const actions = useQuery({ queryKey: ['audit', 'actions'], queryFn: () => api<string[]>('/audit/actions') });
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => api<UserRow[]>('/users') });
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '';

  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Audit log</h1>
          <span className="muted">
            {me?.role === 'SUPER_ADMIN'
              ? 'Every recorded action in the system. Entries cannot be edited or deleted.'
              : 'Activity on your companies and your own actions. Entries cannot be edited or deleted.'}
          </span>
        </div>
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
          <input placeholder="Search person, record or text" value={draft.search} onChange={set('search')} aria-label="Search" />
          <select value={draft.action} onChange={set('action')} aria-label="Action">
            <option value="">All actions</option>
            {actions.data?.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
          <select value={draft.actorId} onChange={set('actorId')} aria-label="Person">
            <option value="">Everyone</option>
            {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select value={draft.companyId} onChange={set('companyId')} aria-label="Company">
            <option value="">All companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
            <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>Company</th></tr>
          </thead>
          <tbody>
            {list.data?.items.map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{formatDateTime(e.at)}</td>
                <td>
                  {e.actorName ?? <span className="muted">Not signed in</span>}
                  {e.actorEmail && <div className="muted small-text">{e.actorEmail}</div>}
                </td>
                <td><span className={`badge ${tone(e.action)}`}>{actionLabel(e.action)}</span></td>
                <td>
                  {e.entityType === 'incident' && e.entityId ? (
                    <Link to={`/incidents/${e.entityId}`}>{e.summary}</Link>
                  ) : (
                    e.summary
                  )}
                  <AuditExtras entry={e} />
                </td>
                <td>{e.companyIds.map(companyName).filter(Boolean).join(', ') || <span className="muted">—</span>}</td>
              </tr>
            ))}
            {list.data?.items.length === 0 && <tr><td colSpan={5} className="muted">No activity matches these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.data && <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onChange={setPage} />}
      {list.error && <div className="error">Could not load the audit log.</div>}
    </>
  );
}

/** What changed and where the request came from, shown only when the entry carries any. */
function AuditExtras({ entry }: { entry: AuditEntry }) {
  const changes = Object.entries(entry.metadata?.changes ?? {});
  const reason = typeof entry.metadata?.reason === 'string' ? entry.metadata.reason : null;
  if (!changes.length && !reason && !entry.ip) return null;
  return (
    <details className="audit-more">
      <summary>More</summary>
      <dl>
        {reason && (<><dt>Reason</dt><dd>{reason}</dd></>)}
        {changes.map(([key, value]) => (<div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>))}
        {entry.ip && (<><dt>From IP</dt><dd>{entry.ip}</dd></>)}
      </dl>
    </details>
  );
}
