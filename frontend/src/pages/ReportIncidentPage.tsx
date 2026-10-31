import { useQuery } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Priority, SlaConfig, Template } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { DynamicField } from '../components/DynamicField';
import { formatBytes, formatMinutes, PRIORITY_LABEL } from '../lib/format';

type Value = string | number | boolean | undefined;

/** UC-4. Reporter flow: (company already chosen) → template → fill in → submit. */
export function ReportIncidentPage() {
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const companyId = activeCompany?.id;

  const templates = useQuery({
    queryKey: ['templates', 'available', companyId],
    queryFn: () => api<Template[]>('/templates/available', { query: { companyId } }),
    enabled: !!companyId,
  });
  const sla = useQuery({ queryKey: ['sla-config'], queryFn: () => api<SlaConfig>('/sla-config') });

  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('P3');
  const [values, setValues] = useState<Record<string, Value>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const template = templates.data?.find((t) => t.id === templateId);

  useEffect(() => {
    if (template) {
      setPriority(template.defaultPriority); // FR-15: pre-filled from the template
      setValues({});
    }
  }, [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !template) return;
    setBusy(true);
    setErrors([]);
    try {
      const dateKeys = new Set(template.fields.filter((f) => f.type === 'DATETIME').map((f) => f.key));
      const fieldValues = Object.fromEntries(
        Object.entries(values)
          .filter(([, v]) => v !== undefined && v !== '')
          // datetime-local carries no zone; the user means Sri Lanka time (NFR-11).
          .map(([k, v]) => [k, dateKeys.has(k) ? new Date(`${v}+05:30`).toISOString() : v]),
      );
      const created = await api<{ id: string; number: string }>('/incidents', {
        method: 'POST',
        body: { companyId, templateId: template.id, title, description, priority, fieldValues },
      });

      if (files.length) {
        const form = new FormData();
        files.forEach((f) => form.append('files', f));
        try {
          await api(`/incidents/${created.id}/attachments`, { method: 'POST', formData: form });
        } catch (err) {
          // The incident exists; send the reporter to it so they can retry the attachment there.
          navigate(`/incidents/${created.id}`, { state: { notice: `${created.number} was created, but attachments failed: ${err instanceof ApiError ? err.message : 'upload error'}` } });
          return;
        }
      }
      navigate(`/incidents/${created.id}`, { state: { notice: `Incident ${created.number} has been reported.` } });
    } catch (err) {
      setErrors(err instanceof ApiError ? (err.details.length ? err.details : [err.message]) : ['Something went wrong.']);
    } finally {
      setBusy(false);
    }
  }

  const window = sla.data?.[priority];

  return (
    <>
      <h1>Report an incident</h1>
      <p className="muted">{activeCompany?.name}</p>

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label htmlFor="template">Template</label>
          <select id="template" required value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Select a template…</option>
            {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {templates.data?.length === 0 && <div className="error">No templates are available for this company yet.</div>}
          {template?.description && <small className="muted">{template.description}</small>}
        </div>

        {template && (
          <>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            {template.fields.map((f) => (
              <DynamicField key={f.key} field={f} value={values[f.key]} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            ))}

            <div className="field">
              <label htmlFor="description">Description</label>
              <textarea id="description" required maxLength={10000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="priority">Priority</label>
              <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
              {window && (
                <small className="muted">
                  Response within {formatMinutes(window.responseMinutes)}, resolution within {formatMinutes(window.resolutionMinutes)}.
                </small>
              )}
            </div>

            <div className="field">
              <label htmlFor="files">Attachments</label>
              <input
                id="files"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.csv"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <small className="muted">PDF, JPG, PNG or CSV. Up to 10 MB each, 5 files.</small>
              {files.map((f) => <div key={f.name}>{f.name} <span className="muted">({formatBytes(f.size)})</span></div>)}
            </div>
          </>
        )}

        {errors.map((m) => <div key={m} className="error" role="alert">{m}</div>)}
        <button disabled={busy || !template}>{busy ? 'Submitting…' : 'Submit incident'}</button>
      </form>
    </>
  );
}
