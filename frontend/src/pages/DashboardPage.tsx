import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { DashboardData, Priority, Stage } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PriorityBadge, SlaBadge } from '../components/Badges';
import { BarList, TrendChart } from '../components/charts';
import { formatDateTime, PRIORITY_LABEL, STAGE_LABEL } from '../lib/format';
import { useState } from 'react';

const RANGES = [7, 30, 90] as const;
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const STAGE_COLOR: Record<Stage, string> = {
  NEW: 'var(--hue-slate)',
  ASSIGNED: 'var(--hue-violet)',
  IN_PROGRESS: 'var(--hue-blue)',
  PENDING: 'var(--hue-amber)',
  RESOLVED: 'var(--hue-green)',
  CLOSED: 'var(--hue-graphite)',
};
const COMPANY_COLORS = ['var(--hue-violet)', 'var(--hue-teal)', 'var(--hue-magenta)', 'var(--hue-blue)'];
const STAGES: Stage[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'];

/** "3 h 20 m" style; averages are not exact multiples so the SLA-settings formatter does not fit. */
function duration(minutes: number | null): { value: string; unit: string } {
  if (minutes === null) return { value: '—', unit: '' };
  if (minutes < 60) return { value: String(minutes), unit: 'min' };
  if (minutes < 2880) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { value: m ? `${h}h ${m}` : String(h), unit: m ? 'm' : 'hr' };
  }
  return { value: (minutes / 1440).toFixed(1), unit: 'days' };
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return <>No change on the previous period</>;
  if (before === 0) return <>None in the previous period</>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <>Same as the previous period</>;
  // More incidents is the worse direction, so a rise is flagged and a fall is calm.
  return (
    <span className={pct > 0 ? 'delta-up' : 'delta-down'}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% <span className="muted" style={{ fontWeight: 400 }}>vs previous</span>
    </span>
  );
}

function Skeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: 96, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 320, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 240 }} />
    </>
  );
}

/** Super Admin / Admin overview. The server applies the same visibility rules as every other query. */
export function DashboardPage() {
  const { me, activeCompany } = useAuth();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const companyId = activeCompany?.id;

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['dashboard', companyId, days],
    queryFn: () => api<DashboardData>('/dashboard', { query: { companyId, days } }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const scopeName = activeCompany?.name ?? (me?.role === 'SUPER_ADMIN' ? 'All companies' : 'Your companies');

  return (
    <>
      <div className="dash-head">
        <div>
          <h1>Overview</h1>
          <span className="muted">{scopeName}{isFetching && !isLoading ? ' · updating…' : ''}</span>
        </div>
        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} aria-pressed={days === r} onClick={() => setDays(r)}>Last {r} days</button>
          ))}
        </div>
      </div>

      {isLoading && <Skeleton />}
      {isError && <div className="error">{error instanceof Error ? error.message : 'The dashboard could not be loaded.'}</div>}
      {data && <DashboardBody data={data} showCompanies={!activeCompany && data.byCompany.length > 1} />}
    </>
  );
}

function DashboardBody({ data, showCompanies }: { data: DashboardData; showCompanies: boolean }) {
  const { kpis } = data;
  const resolution = duration(kpis.avgResolutionMinutes);
  const response = duration(kpis.avgResponseMinutes);
  const totalOpen = kpis.open;

  return (
    <>
      <section className="kpis" aria-label="Key figures">
        <div className="kpi">
          <div className="label">Open incidents</div>
          <div className="value">{kpis.open}</div>
          <div className="note">{kpis.unassigned} not yet assigned</div>
        </div>
        <div className={`kpi ${kpis.breached > 0 ? 'alert' : ''}`}>
          <div className="label">SLA breached</div>
          <div className="value">{kpis.breached}</div>
          <div className="note">{kpis.breached === 0 ? 'Nothing overdue' : 'Past their deadline'}</div>
        </div>
        <div className={`kpi ${kpis.dueSoon > 0 ? 'warn' : ''}`}>
          <div className="label">Due soon</div>
          <div className="value">{kpis.dueSoon}</div>
          <div className="note">Over 75% of the time used</div>
        </div>
        <div className="kpi">
          <div className="label">Resolved on time</div>
          <div className="value">
            {kpis.slaCompliance === null ? '—' : kpis.slaCompliance}
            {kpis.slaCompliance !== null && <small>%</small>}
          </div>
          <div className="note">{kpis.resolved} resolved in this period</div>
        </div>
        <div className="kpi">
          <div className="label">Avg. time to resolve</div>
          <div className="value">
            {resolution.value}
            {resolution.unit && <small>{resolution.unit}</small>}
          </div>
          <div className="note">First response {response.value}{response.unit ? ` ${response.unit}` : ''}</div>
        </div>
      </section>

      <div className="dash-grid">
        <section className="panel span-8" aria-labelledby="trend-title">
          <div className="panel-head">
            <div>
              <h2 id="trend-title">Reported and resolved</h2>
              <p className="sub">
                {kpis.created} reported · <Delta now={kpis.created} before={kpis.createdPrevious} />
              </p>
            </div>
            <div className="legend" aria-hidden="true">
              <span><i style={{ background: 'var(--series-1)' }} />Reported</span>
              <span><i style={{ background: 'var(--series-2)' }} />Resolved</span>
            </div>
          </div>
          <TrendChart points={data.trend} />
        </section>

        <section className="panel span-4" aria-labelledby="priority-title">
          <h2 id="priority-title">Open by priority</h2>
          <p className="sub">{totalOpen} open right now</p>
          <BarList
            empty="No open incidents."
            items={PRIORITIES.map((p) => ({
              key: p,
              label: PRIORITY_LABEL[p],
              value: data.openByPriority[p],
              color: `var(--${p.toLowerCase()})`,
            }))}
          />
        </section>

        <section className="panel span-8" aria-labelledby="attention-title">
          <h2 id="attention-title">Needs attention</h2>
          <p className="sub">Open incidents that are overdue or close to their deadline</p>
          {data.attention.length === 0 ? (
            <div className="empty">Everything open is on track.</div>
          ) : (
            <div className="attention-list">
              {data.attention.map((item) => (
                <Link className="attention-item" to={`/incidents/${item.id}`} key={item.id}>
                  <PriorityBadge priority={item.priority} />
                  <div className="a-main">
                    <div className="a-title">{item.title}</div>
                    <div className="a-meta">
                      {item.number} · {item.company} · {STAGE_LABEL[item.stage]} · {item.assignee ?? 'Unassigned'}
                    </div>
                  </div>
                  <div className="a-due">
                    <SlaBadge status={item.slaStatus} />
                    <div>Due {formatDateTime(item.resolutionDueAt)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel span-4" aria-labelledby="stage-title">
          <h2 id="stage-title">Where incidents are</h2>
          <p className="sub">Open stages now; resolved and closed in this period</p>
          <BarList
            empty="No incidents yet."
            items={STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], value: data.byStage[s], color: STAGE_COLOR[s] }))}
          />
        </section>
      </div>

      <div className="dash-grid">
        {showCompanies && (
          <section className="panel span-3" aria-labelledby="company-title">
            <h2 id="company-title">By company</h2>
            <p className="sub">Reported in this period</p>
            <BarList items={data.byCompany.map((c, i) => ({ color: COMPANY_COLORS[i % COMPANY_COLORS.length], key: c.id, label: c.name, value: c.created, hint: `${c.name}: ${c.created} reported, ${c.open} open, ${c.breached} breached` }))} />
          </section>
        )}
        <section className={`panel ${showCompanies ? 'span-3' : 'span-4'}`} aria-labelledby="workload-title">
          <h2 id="workload-title">Team workload</h2>
          <p className="sub">Open incidents per assignee</p>
          <BarList
            empty="Nothing is assigned right now."
            items={data.workload.map((w) => ({ color: 'var(--hue-violet)', key: w.id, label: w.name, value: w.open, hint: `${w.name}: ${w.open} open, ${w.breached} breached` }))}
          />
        </section>
        <section className={`panel ${showCompanies ? 'span-3' : 'span-4'}`} aria-labelledby="cause-title">
          <h2 id="cause-title">Top root causes</h2>
          <p className="sub">Of incidents resolved in this period</p>
          <BarList empty="No root causes recorded yet." items={data.topRootCauses.map((r) => ({ color: 'var(--hue-green)', key: r.name, label: r.name, value: r.count }))} />
        </section>
        <section className={`panel ${showCompanies ? 'span-3' : 'span-4'}`} aria-labelledby="template-title">
          <h2 id="template-title">Most used templates</h2>
          <p className="sub">Reported in this period</p>
          <BarList items={data.topTemplates.map((t) => ({ color: 'var(--hue-magenta)', key: t.name, label: t.name, value: t.count }))} />
        </section>
      </div>
    </>
  );
}
