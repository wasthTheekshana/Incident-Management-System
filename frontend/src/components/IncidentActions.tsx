import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { IncidentDetail, Priority, RootCause, Stage } from '../api/types';
import { NEXT_STAGES, PRIORITY_LABEL, STAGE_LABEL } from '../lib/format';

interface Props {
  incident: IncidentDetail;
  onChanged: () => void;
}

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong.');

/** Runs a mutation and surfaces the server's message inline; the server remains the authority on every rule. */
function useAction<T>(fn: (input: T) => Promise<unknown>, onChanged: () => void) {
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: fn,
    onMutate: () => setError(''),
    onSuccess: onChanged,
    onError: (e) => setError(messageOf(e)),
  });
  return { run: mutation.mutate, busy: mutation.isPending, error };
}

function StagePanel({ incident, onChanged }: Props) {
  const [comment, setComment] = useState('');
  const action = useAction((stage: Stage) => api(`/incidents/${incident.id}/stage`, { method: 'POST', body: { stage, comment: comment || undefined } }), () => {
    setComment('');
    onChanged();
  });
  const options = NEXT_STAGES[incident.stage];
  if (!incident.permissions.changeStage || !options.length) return null;

  return (
    <div className="card">
      <h2>Update stage</h2>
      <div className="field">
        <label htmlFor="stage-comment">Comment <span className="muted">(required for Pending, Resolved or rejecting a resolution)</span></label>
        <textarea id="stage-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <div className="row">
        {options.map((stage) => (
          <button key={stage} disabled={action.busy} className={stage === 'CLOSED' ? '' : 'secondary'} onClick={() => action.run(stage)}>
            {incident.stage === 'RESOLVED' && stage === 'IN_PROGRESS' ? 'Reject resolution' : `Move to ${STAGE_LABEL[stage]}`}
          </button>
        ))}
      </div>
      {action.error && <div className="error" role="alert">{action.error}</div>}
    </div>
  );
}

function RootCausePanel({ incident, onChanged }: Props) {
  const causes = useQuery({
    queryKey: ['root-causes', incident.company.id],
    queryFn: () => api<RootCause[]>('/root-causes', { query: { companyId: incident.company.id } }),
    enabled: incident.permissions.editRootCause,
  });
  const [choice, setChoice] = useState(incident.rootCauseId ?? (incident.rootCauseText ? 'OTHER' : ''));
  const [other, setOther] = useState(incident.rootCauseText ?? '');
  const [corrective, setCorrective] = useState(incident.correctiveAction ?? '');
  const [notes, setNotes] = useState(incident.resolutionNotes ?? '');
  const [saved, setSaved] = useState(false);

  const action = useAction(
    () =>
      api(`/incidents/${incident.id}/root-cause`, {
        method: 'PUT',
        body: {
          ...(choice === 'OTHER' ? { rootCauseText: other } : { rootCauseId: choice }),
          correctiveAction: corrective,
          resolutionNotes: notes,
        },
      }),
    () => {
      setSaved(true);
      onChanged();
    },
  );

  if (!incident.permissions.editRootCause) return null;
  const editable = incident.stage === 'IN_PROGRESS' || incident.stage === 'PENDING';
  if (!editable) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(false);
    action.run(undefined);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Root cause &amp; resolution</h2>
      <div className="field">
        <label htmlFor="rc">Root cause</label>
        <select id="rc" required value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">Select…</option>
          {causes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="OTHER">Other (type below)</option>
        </select>
      </div>
      {choice === 'OTHER' && (
        <div className="field">
          <label htmlFor="rc-other">Describe the root cause</label>
          <input id="rc-other" required minLength={2} maxLength={500} value={other} onChange={(e) => setOther(e.target.value)} />
        </div>
      )}
      <div className="field">
        <label htmlFor="ca">Corrective action</label>
        <textarea id="ca" value={corrective} onChange={(e) => setCorrective(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="rn">Resolution notes <span className="muted">(required before resolving)</span></label>
        <textarea id="rn" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button disabled={action.busy}>Save</button>
      {saved && <span className="success"> Saved.</span>}
      {action.error && <div className="error" role="alert">{action.error}</div>}
    </form>
  );
}

function AssignPanel({ incident, onChanged }: Props) {
  const { permissions } = incident;
  const members = useQuery({
    queryKey: ['company-members', incident.company.id],
    queryFn: () => api<{ id: string; name: string }[]>(`/companies/${incident.company.id}/members`),
    enabled: permissions.reassign || permissions.assignResolver,
  });
  const [assignee, setAssignee] = useState('');
  const [reason, setReason] = useState('');
  const [resolver, setResolver] = useState('');

  const reassign = useAction(() => api(`/incidents/${incident.id}/assignee`, { method: 'PUT', body: { userId: assignee, reason } }), () => {
    setReason('');
    onChanged();
  });
  const assignResolver = useAction(() => api(`/incidents/${incident.id}/resolver`, { method: 'PUT', body: { userId: resolver } }), onChanged);

  if (!permissions.reassign && !permissions.assignResolver) return null;
  const active = members.data ?? [];

  return (
    <div className="card">
      <h2>Assignment</h2>
      {permissions.reassign && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            reassign.run(undefined);
          }}
        >
          <div className="field">
            <label htmlFor="assignee">Reassign to</label>
            <select id="assignee" required value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Select user…</option>
              {active.filter((u) => u.id !== incident.assignee?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reason">Reason</label>
            <input id="reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button disabled={reassign.busy}>Reassign</button>
          {reassign.error && <div className="error" role="alert">{reassign.error}</div>}
        </form>
      )}
      {permissions.assignResolver && (
        <form
          style={{ marginTop: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            assignResolver.run(undefined);
          }}
        >
          <div className="field">
            <label htmlFor="resolver">Resolver {incident.resolver && <span className="muted">(currently {incident.resolver.name})</span>}</label>
            <select id="resolver" required value={resolver} onChange={(e) => setResolver(e.target.value)}>
              <option value="">Select user…</option>
              {active.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <button className="secondary" disabled={assignResolver.busy}>Assign resolver</button>
          {assignResolver.error && <div className="error" role="alert">{assignResolver.error}</div>}
        </form>
      )}
    </div>
  );
}

function PriorityPanel({ incident, onChanged }: Props) {
  const [priority, setPriority] = useState<Priority>(incident.priority);
  const [reason, setReason] = useState('');
  const action = useAction(() => api(`/incidents/${incident.id}/priority`, { method: 'PUT', body: { priority, reason } }), () => {
    setReason('');
    onChanged();
  });
  if (!incident.permissions.changePriority) return null;

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        action.run(undefined);
      }}
    >
      <h2>Change priority</h2>
      <div className="field">
        <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pr-reason">Reason</label>
        <input id="pr-reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <button className="secondary" disabled={action.busy || priority === incident.priority}>Change priority</button>
      {action.error && <div className="error" role="alert">{action.error}</div>}
    </form>
  );
}

export function IncidentActions(props: Props) {
  if (props.incident.stage === 'CLOSED') return null;
  return (
    <>
      <StagePanel {...props} />
      <RootCausePanel {...props} />
      <AssignPanel {...props} />
      <PriorityPanel {...props} />
    </>
  );
}
