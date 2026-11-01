import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { AppNotification } from '../api/types';
import { formatDateTime } from '../lib/format';
import { Icon } from './Icon';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const count = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const items = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api<AppNotification[]>('/notifications'),
    enabled: open,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST' }), onSuccess: refresh });

  return (
    <div className="bell">
      <button onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Icon name="bell" />{!!count.data?.count && <span className="count">{count.data.count}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="row" style={{ justifyContent: 'space-between', padding: '8px 12px' }}>
            <strong>Notifications</strong>
            <button className="secondary small" onClick={() => markAll.mutate()}>Mark all read</button>
          </div>
          {items.data?.length === 0 && <div className="item muted">Nothing yet.</div>}
          {items.data?.map((n) => (
            <div
              key={n.id}
              className={`item ${n.readAt ? '' : 'unread'}`}
              onClick={() => {
                markRead.mutate(n.id);
                setOpen(false);
                if (n.incidentId) navigate(`/incidents/${n.incidentId}`);
              }}
            >
              <div><strong>{n.subject}</strong></div>
              <div className="muted">{formatDateTime(n.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
