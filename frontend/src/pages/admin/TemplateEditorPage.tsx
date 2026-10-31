import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { FieldType, Priority, Template } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { DynamicField } from '../../components/DynamicField';
import { PRIORITY_LABEL } from '../../lib/format';

interface FieldDraft {
  key?: string;
  label: string;
  type: FieldType;
  optionsText: string;
  mandatory: boolean;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'SHORT_TEXT', label: 'Short text' },
  { value: 'LONG_TEXT', label: 'Long text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATETIME', label: 'Date / time' },
  { value: 'DROPDOWN', label: 'Dropdown' },
  { value: 'CHECKBOX', label: 'Checkbox' },
];

/** FR-10 / FR-11 / UC-3 */
export function TemplateEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { companies } = useAuth();

  const existing = useQuery({ queryKey: ['templates', id], queryFn: () => api<Template>(`/templates/${id}`), enabled: !isNew });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('');
  const [defaultPriority, setDefaultPriority] = useState<Priority>('P3');
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [fields, setFields] = useState<FieldDraft[]>([]);
  const [previewValues, setPreviewValues] = useState<Record<string, string | number | boolean | undefined>>({});
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const t = existing.data;
    if (!t) return;
    setName(t.name);
    setDescription(t.description ?? '');
    setDefaultCategory(t.defaultCategory ?? '');
    setDefaultPriority(t.defaultPriority);
    setCompanyIds(t.companies.map((c) => c.id));
    setActive(t.active);
    setFields(t.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, optionsText: (f.options ?? []).join('\n'), mandatory: f.mandatory })));
  }, [existing.data]);

  const payload = () => ({
    name,
    description: description || undefined,
    defaultCategory: defaultCategory || undefined,
    defaultPriority,
    companyIds,
    active,
    fields: fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      mandatory: f.mandatory,
      options: f.type === 'DROPDOWN' ? f.optionsText.split('\n').map((o) => o.trim()).filter(Boolean) : undefined,
    })),
  });

  const save = useMutation({
    mutationFn: () => (isNew ? api<Template>('/templates', { method: 'POST', body: payload() }) : api<Template>(`/templates/${id}`, { method: 'PUT', body: payload() })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      navigate('/admin/templates');
    },
    onError: (e) => setErrors(e instanceof ApiError ? (e.details.length ? e.details : [e.message]) : ['Something went wrong.']),
  });

  const updateField = (index: number, patch: Partial<FieldDraft>) =>
    setFields((fs) => fs.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const move = (index: number, delta: number) =>
    setFields((fs) => {
      const next = [...fs];
      const target = index + delta;
      if (target < 0 || target >= next.length) return fs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const previewFields = fields.map((f, i) => ({
    key: f.key ?? `preview_${i}`,
    label: f.label || '(untitled)',
    type: f.type,
    mandatory: f.mandatory,
    options: f.type === 'DROPDOWN' ? f.optionsText.split('\n').map((o) => o.trim()).filter(Boolean) : null,
  }));

  return (
    <>
      <h1>{isNew ? 'New template' : 'Edit template'}</h1>
      {!isNew && existing.data && <p className="muted">Version {existing.data.version}. Changing fields creates a new version; existing incidents keep the version they used.</p>}

      <form
        className="card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setErrors([]);
          save.mutate();
        }}
      >
        <div className="grid cols-2">
          <div className="field"><label htmlFor="t-name">Name</label><input id="t-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="t-cat">Default category</label><input id="t-cat" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} /></div>
          <div className="field">
            <label htmlFor="t-pr">Default priority</label>
            <select id="t-pr" value={defaultPriority} onChange={(e) => setDefaultPriority(e.target.value as Priority)}>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <label style={{ fontWeight: 400 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active (visible to reporters)</label>
          </div>
        </div>
        <div className="field"><label htmlFor="t-desc">Description</label><textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="field">
          <label>Available to companies</label>
          {companies.map((c) => (
            <label key={c.id} style={{ fontWeight: 400 }}>
              <input type="checkbox" checked={companyIds.includes(c.id)} onChange={(e) => setCompanyIds(e.target.checked ? [...companyIds, c.id] : companyIds.filter((x) => x !== c.id))} />
              {c.name}
            </label>
          ))}
        </div>

        <h2>Fields</h2>
        {fields.map((f, i) => (
          <div className="card" key={i}>
            <div className="grid cols-2">
              <div className="field"><label>Label</label><input required value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} /></div>
              <div className="field">
                <label>Type</label>
                <select value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FieldType })}>
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            {f.type === 'DROPDOWN' && (
              <div className="field"><label>Options (one per line)</label><textarea required value={f.optionsText} onChange={(e) => updateField(i, { optionsText: e.target.value })} /></div>
            )}
            <div className="row">
              <label style={{ fontWeight: 400 }}><input type="checkbox" checked={f.mandatory} onChange={(e) => updateField(i, { mandatory: e.target.checked })} />Mandatory</label>
              <button type="button" className="secondary small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="secondary small" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>↓</button>
              <button type="button" className="danger small" onClick={() => setFields(fields.filter((_, x) => x !== i))}>Remove</button>
            </div>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setFields([...fields, { label: '', type: 'SHORT_TEXT', optionsText: '', mandatory: false }])}>Add field</button>

        {errors.map((m) => <div key={m} className="error" role="alert">{m}</div>)}
        <div className="row" style={{ marginTop: 16 }}>
          <button disabled={save.isPending || companyIds.length === 0}>{save.isPending ? 'Saving…' : 'Save template'}</button>
          <button type="button" className="secondary" onClick={() => navigate('/admin/templates')}>Cancel</button>
        </div>
      </form>

      <div className="card">
        <h2>Preview</h2>
        {previewFields.length === 0 && <p className="muted">Add fields to see the form reporters will fill in.</p>}
        {previewFields.map((f) => (
          <DynamicField key={f.key} field={{ ...f, options: f.options }} value={previewValues[f.key]} onChange={(v) => setPreviewValues((s) => ({ ...s, [f.key]: v }))} />
        ))}
      </div>
    </>
  );
}
