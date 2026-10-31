import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { NotificationConfigRow } from '../../api/types';

const AUDIENCES: { value: string; label: string }[] = [
  { value: 'REPORTER', label: 'Reporter' },
  { value: 'ASSIGNEE', label: 'Assignee' },
  { value: 'RESOLVER', label: 'Resolver' },
  { value: 'PREVIOUS_ASSIGNEE', label: 'Previous assignee' },
  { value: 'COMPANY_ADMINS', label: 'Company admins' },
];

const EVENT_LABEL: Record<string, string> = {
  INCIDENT_CREATED: 'Incident created',
  ASSIGNED: 'Assigned / reassigned',
  STAGE_CHANGED: 'Stage changed',
  SLA_DUE_SOON: 'SLA due soon',
  SLA_BREACHED: 'SLA breached',
  RESOLVER_ASSIGNED: 'Resolver assigned',
};

function EventCard({ row }: { row: NotificationConfigRow }) {
  const queryClient = useQueryClient();
  const [audiences, setAudiences] = useState(row.audiences);
  const [subject, setSubject] = useState(row.template.subject);
  const [body, setBody] = useState(row.template.body);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation({
    mutationFn: () => api(`/notifications/config/${row.event}`, { method: 'PUT', body: { audiences, subject, body } }),
    onSuccess: () => {
      setMsg({ ok: true, text: 'Saved.' });
      queryClient.invalidateQueries({ queryKey: ['notification-config'] });
    },
    onError: (e) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' }),
  });

  return (
    <div className="card">
      <h2>{EVENT_LABEL[row.event] ?? row.event}</h2>
      <div className="field">
        <label>Notify</label>
        <div className="row">
          {AUDIENCES.map((a) => (
            <label key={a.value} style={{ fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={audiences.includes(a.value)}
                onChange={(e) => setAudiences(e.target.checked ? [...audiences, a.value] : audiences.filter((x) => x !== a.value))}
              />
              {a.label}
            </label>
          ))}
        </div>
      </div>
      <div className="field"><label>Email subject</label><input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      <div className="field"><label>Email body</label><textarea value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <small className="muted">Placeholders: {'{{number}} {{title}} {{company}} {{priority}} {{assignee}} {{resolver}} {{oldStage}} {{newStage}} {{actor}} {{comment}} {{responseDue}} {{resolutionDue}} {{link}}'}</small>
      <div style={{ marginTop: 8 }}>
        <button onClick={() => { setMsg(null); save.mutate(); }} disabled={save.isPending}>Save</button>
        {msg && <span className={msg.ok ? 'success' : 'error'}> {msg.text}</span>}
      </div>
    </div>
  );
}

/** FR-25 */
export function NotificationSettingsPage() {
  const config = useQuery({ queryKey: ['notification-config'], queryFn: () => api<NotificationConfigRow[]>('/notifications/config') });
  return (
    <>
      <h1>Notification settings</h1>
      <p className="muted">Choose who is notified for each event and edit the email text.</p>
      {config.data?.map((row) => <EventCard key={row.event} row={row} />)}
    </>
  );
}
