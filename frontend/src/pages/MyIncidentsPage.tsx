import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { IncidentListItem, Paged, Stage } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PriorityBadge, SlaBadge, StageBadge } from '../components/Badges';
import { formatDateTime, STAGE_LABEL } from '../lib/format';

type StageCounts = Partial<Record<Stage, number>>;
const STAGES = Object.keys(STAGE_LABEL) as Stage[];

function StageCards({ title, counts }: { title: string; counts: StageCounts }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="grid cols-4">
        {STAGES.map((stage) => (
          <div className="stat" key={stage}>
            <div className="n">{counts[stage] ?? 0}</div>
            <div className="muted">{STAGE_LABEL[stage]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** FR-35: incidents the user reported and incidents assigned to them, with counts by stage. */
export function MyIncidentsPage() {
  const { me, activeCompany } = useAuth();
  const companyId = activeCompany?.id;

  const summary = useQuery({
    queryKey: ['incidents', 'mine', companyId],
    queryFn: () => api<{ reported: StageCounts; assigned: StageCounts }>('/incidents/mine', { query: { companyId } }),
  });
  const assigned = useQuery({
    queryKey: ['incidents', 'assigned-to-me', me?.id, companyId],
    queryFn: () => api<Paged<IncidentListItem>>('/incidents', { query: { assigneeId: me?.id, companyId, pageSize: 10 } }),
    enabled: !!me,
  });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>My Incidents</h1>
          <span className="muted">{activeCompany?.name}</span>
        </div>
        <Link className="btn" to="/report">Report incident</Link>
      </div>

      {summary.data && (
        <div className="grid cols-2">
          <StageCards title="Reported by me" counts={summary.data.reported} />
          <StageCards title="Assigned to me" counts={summary.data.assigned} />
        </div>
      )}

      <h2>Assigned to me</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Number</th><th>Title</th><th>Priority</th><th>Stage</th><th>Resolution due</th><th>SLA</th></tr>
          </thead>
          <tbody>
            {assigned.data?.items.map((i) => (
              <tr key={i.id}>
                <td><Link to={`/incidents/${i.id}`}>{i.number}</Link></td>
                <td>{i.title}</td>
                <td><PriorityBadge priority={i.priority} /></td>
                <td><StageBadge stage={i.stage} /></td>
                <td>{formatDateTime(i.resolutionDueAt)}</td>
                <td><SlaBadge status={i.slaStatus} /></td>
              </tr>
            ))}
            {assigned.data?.items.length === 0 && (
              <tr><td colSpan={6} className="muted">Nothing is assigned to you.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
