import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api, ApiError, download } from '../api/client';
import type { IncidentDetail, Stage } from '../api/types';
import { PriorityBadge, SlaBadge, StageBadge } from '../components/Badges';
import { IncidentActions } from '../components/IncidentActions';
import { formatBytes, formatDateTime, STAGE_LABEL } from '../lib/format';

const HISTORY_LABEL: Record<string, string> = {
  CREATED: 'Incident created',
  ASSIGNED: 'Assigned',
  REASSIGNED: 'Reassigned',
  RESOLVER_ASSIGNED: 'Resolver assigned',
  STAGE_CHANGED: 'Stage changed',
  PRIORITY_CHANGED: 'Priority changed',
  SLA_RECALCULATED: 'SLA recalculated',
  ROOT_CAUSE_RECORDED: 'Root cause recorded',
  ATTACHMENT_ADDED: 'Attachment added',
  COMMENTED: 'Comment added',
};

export function IncidentDetailPage() {
  const { id = '' } = useParams();
  const notice = (useLocation().state as { notice?: string } | null)?.notice;
  const queryClient = useQueryClient();
  const key = ['incident', id];

  const query = useQuery({ queryKey: key, queryFn: () => api<IncidentDetail>(`/incidents/${id}`) });
  const reload = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['incidents'] });
  };

  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const addComment = useMutation({
    mutationFn: () => api(`/incidents/${id}/comments`, { method: 'POST', body: { body: comment } }),
    onSuccess: () => {
      setComment('');
      reload();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not add comment'),
  });
  const upload = useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      return api(`/incidents/${id}/attachments`, { method: 'POST', formData: form });
    },
    onSuccess: reload,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Upload failed'),
  });

  if (query.isLoading) return <p className="muted">Loading…</p>;
  if (query.isError || !query.data) return <div className="error">Incident not found or you do not have access.</div>;
  const i = query.data;

  return (
    <>
      {notice && <div className="card success">{notice}</div>}
      <div className="topbar">
        <div>
          <h1>{i.number} · {i.title}</h1>
          <div className="row">
            <PriorityBadge priority={i.priority} /> <StageBadge stage={i.stage} /> <SlaBadge status={i.slaStatus} />
            {i.pausedAt && <span className="badge">SLA paused</span>}
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div>
          <div className="card">
            <h2>Details</h2>
            <dl className="facts">
              <dt>Company</dt><dd>{i.company.name}</dd>
              <dt>Template</dt><dd>{i.template.name}</dd>
              <dt>Reporter</dt><dd>{i.reporter.name}</dd>
              <dt>Assignee</dt><dd>{i.assignee?.name ?? <span className="muted">Unassigned</span>}</dd>
              <dt>Resolver</dt><dd>{i.resolver?.name ?? '—'}</dd>
              <dt>Created</dt><dd>{formatDateTime(i.createdAt)}</dd>
              <dt>Response due</dt><dd>{formatDateTime(i.responseDueAt)} {i.respondedAt && <span className="muted">(responded {formatDateTime(i.respondedAt)})</span>}</dd>
              <dt>Resolution due</dt><dd>{formatDateTime(i.resolutionDueAt)} {i.resolvedAt && <span className="muted">(resolved {formatDateTime(i.resolvedAt)})</span>}</dd>
              {i.templateFields.map((f) => (
                <FieldRow key={f.key} label={f.label} value={i.fieldValues[f.key]} />
              ))}
            </dl>
            <h2 style={{ marginTop: 16 }}>Description</h2>
            {/* Rendered as text, never HTML, so reporter content cannot inject markup. */}
            <p style={{ whiteSpace: 'pre-wrap' }}>{i.description}</p>
          </div>

          {(i.rootCause || i.rootCauseText) && (
            <div className="card">
              <h2>Root cause</h2>
              <dl className="facts">
                <dt>Root cause</dt><dd>{i.rootCause?.name ?? i.rootCauseText}</dd>
                <dt>Corrective action</dt><dd>{i.correctiveAction || '—'}</dd>
                <dt>Resolution notes</dt><dd>{i.resolutionNotes || '—'}</dd>
              </dl>
            </div>
          )}

          <div className="card">
            <h2>Attachments</h2>
            {i.attachments.length === 0 && <p className="muted">No attachments.</p>}
            {i.attachments.map((a) => (
              <div key={a.id}>
                <button className="secondary small" onClick={() => download(`/incidents/${i.id}/attachments/${a.id}`)}>{a.fileName}</button>{' '}
                <span className="muted">{formatBytes(a.size)} · {formatDateTime(a.uploadedAt)}</span>
              </div>
            ))}
            {i.permissions.attach && (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="add-files">Add files</label>
                <input
                  id="add-files"
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.csv"
                  disabled={upload.isPending}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) upload.mutate(files);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </div>

          <div className="card">
            <h2>Comments</h2>
            {i.comments.length === 0 && <p className="muted">No comments yet.</p>}
            {i.comments.map((c) => (
              <div className="comment" key={c.id}>
                <strong>{c.author.name}</strong> <span className="muted">{formatDateTime(c.createdAt)}</span>
                <div>{c.body}</div>
              </div>
            ))}
            <form
              style={{ marginTop: 12 }}
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                setError('');
                addComment.mutate();
              }}
            >
              <div className="field">
                <label htmlFor="comment">Add a comment</label>
                <textarea id="comment" required maxLength={5000} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <button disabled={addComment.isPending}>Comment</button>
            </form>
            {error && <div className="error" role="alert">{error}</div>}
          </div>
        </div>

        <div>
          <IncidentActions incident={i} onChanged={reload} />
          <div className="card">
            <h2>History</h2>
            <ul className="timeline">
              {[...i.history].reverse().map((h) => (
                <li key={h.id}>
                  <strong>{HISTORY_LABEL[h.action] ?? h.action}</strong>
                  {h.field && h.action !== 'COMMENTED' && h.action !== 'ATTACHMENT_ADDED' && (
                    <span className="muted"> · {historyValue(h.field, h.oldValue)} → {historyValue(h.field, h.newValue)}</span>
                  )}
                  <div className="muted">{h.user?.name ?? 'System'} · {formatDateTime(h.createdAt)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

/** Stage values are stored as enum names; show the same labels as everywhere else in the UI. */
function historyValue(field: string | null, value: string | null): string {
  if (!value) return '—';
  return field === 'stage' && value in STAGE_LABEL ? STAGE_LABEL[value as Stage] : value;
}

function FieldRow({ label, value }: { label: string; value: string | number | boolean | undefined }) {
  const text = value === undefined ? '—' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return (
    <>
      <dt>{label}</dt>
      <dd>{text}</dd>
    </>
  );
}
