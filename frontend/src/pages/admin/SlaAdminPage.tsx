import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Priority, SlaConfig } from '../../api/types';
import { fromMinutes, PRIORITY_LABEL, toMinutes } from '../../lib/format';

type Unit = 'min' | 'hr' | 'day';
interface Cell { value: number; unit: Unit }
type Draft = Record<Priority, { response: Cell; resolution: Cell }>;

const PRIORITIES = Object.keys(PRIORITY_LABEL) as Priority[];

function TimeInput({ label, cell, onChange }: { label: string; cell: Cell; onChange: (c: Cell) => void }) {
  return (
    <div className="row">
      <input type="number" min={1} required aria-label={label} style={{ width: 90 }} value={cell.value} onChange={(e) => onChange({ ...cell, value: Number(e.target.value) })} />
      <select aria-label={`${label} unit`} style={{ width: 100 }} value={cell.unit} onChange={(e) => onChange({ ...cell, unit: e.target.value as Unit })}>
        <option value="min">minutes</option>
        <option value="hr">hours</option>
        <option value="day">days</option>
      </select>
    </div>
  );
}

/** FR-17 / UC-8. New values apply to incidents created from now on. */
export function SlaAdminPage() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['sla-config'], queryFn: () => api<SlaConfig>('/sla-config') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!config.data) return;
    setDraft(Object.fromEntries(PRIORITIES.map((p) => [p, { response: fromMinutes(config.data[p].responseMinutes), resolution: fromMinutes(config.data[p].resolutionMinutes) }])) as Draft);
  }, [config.data]);

  const save = useMutation({
    mutationFn: () =>
      api('/sla-config', {
        method: 'PUT',
        body: {
          priorities: PRIORITIES.map((p) => ({
            priority: p,
            responseMinutes: toMinutes(draft![p].response.value, draft![p].response.unit),
            resolutionMinutes: toMinutes(draft![p].resolution.value, draft![p].resolution.unit),
          })),
        },
      }),
    onSuccess: () => {
      setError('');
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['sla-config'] });
    },
    onError: (e) => {
      setSaved(false);
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    },
  });

  if (!draft) return <p className="muted">Loading…</p>;

  return (
    <>
      <h1>Priority &amp; SLA</h1>
      <p className="muted">Times are measured in calendar time. Changes apply to new incidents; existing incidents keep their due times.</p>
      <form
        className="card"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setSaved(false);
          save.mutate();
        }}
      >
        <table>
          <thead><tr><th>Priority</th><th>Response time</th><th>Resolution time</th></tr></thead>
          <tbody>
            {PRIORITIES.map((p) => (
              <tr key={p}>
                <td>{PRIORITY_LABEL[p]}</td>
                <td><TimeInput label={`${p} response`} cell={draft[p].response} onChange={(c) => setDraft({ ...draft, [p]: { ...draft[p], response: c } })} /></td>
                <td><TimeInput label={`${p} resolution`} cell={draft[p].resolution} onChange={(c) => setDraft({ ...draft, [p]: { ...draft[p], resolution: c } })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="error" role="alert">{error}</div>}
        {saved && <div className="success">Saved.</div>}
        <div style={{ marginTop: 12 }}><button disabled={save.isPending}>Save</button></div>
      </form>
    </>
  );
}
