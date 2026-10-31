import type { Priority, SlaStatus, Stage } from '../api/types';
import { PRIORITY_LABEL, SLA_LABEL, STAGE_LABEL } from '../lib/format';

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <span className={`badge ${priority}`}>{PRIORITY_LABEL[priority]}</span>
);

export const StageBadge = ({ stage }: { stage: Stage }) => <span className="badge">{STAGE_LABEL[stage]}</span>;

export const SlaBadge = ({ status }: { status: SlaStatus }) => (
  <span className={`badge ${status}`}>{SLA_LABEL[status]}</span>
);

export const ActiveBadge = ({ active }: { active: boolean }) => (
  <span className={`badge ${active ? 'ON_TRACK' : 'off'}`}>{active ? 'Active' : 'Inactive'}</span>
);
