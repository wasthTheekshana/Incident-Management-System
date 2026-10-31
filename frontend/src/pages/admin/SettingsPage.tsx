import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';

interface Settings { sessionIdleMinutes: number; attachmentMaxBytes: number; attachmentMaxFiles: number }
const MB = 1024 * 1024;

/** Session idle timeout (FR-3) and attachment limits (§2.5), configurable by Super Admin. */
export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const [idle, setIdle] = useState(30);
  const [maxMb, setMaxMb] = useState(10);
  const [maxFiles, setMaxFiles] = useState(5);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setIdle(settings.data.sessionIdleMinutes);
    setMaxMb(settings.data.attachmentMaxBytes / MB);
    setMaxFiles(settings.data.attachmentMaxFiles);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () =>
      api('/settings', { method: 'PUT', body: { sessionIdleMinutes: idle, attachmentMaxBytes: Math.round(maxMb * MB), attachmentMaxFiles: maxFiles } }),
    onSuccess: () => {
      setMsg({ ok: true, text: 'Saved.' });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' }),
  });

  return (
    <>
      <h1>Settings</h1>
      <form className="card" onSubmit={(e: FormEvent) => { e.preventDefault(); setMsg(null); save.mutate(); }}>
        <div className="field"><label htmlFor="idle">Session idle timeout (minutes)</label><input id="idle" type="number" min={5} max={480} required value={idle} onChange={(e) => setIdle(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="mb">Maximum attachment size (MB)</label><input id="mb" type="number" min={1} max={50} step={1} required value={maxMb} onChange={(e) => setMaxMb(Number(e.target.value))} /></div>
        <div className="field"><label htmlFor="files">Maximum files per upload</label><input id="files" type="number" min={1} max={20} required value={maxFiles} onChange={(e) => setMaxFiles(Number(e.target.value))} /></div>
        <button disabled={save.isPending}>Save</button>
        {msg && <span className={msg.ok ? 'success' : 'error'}> {msg.text}</span>}
      </form>
    </>
  );
}
