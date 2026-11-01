import { useRef, useState } from 'react';

export interface TrendPoint {
  date: string; // YYYY-MM-DD, Sri Lanka calendar day
  created: number;
  resolved: number;
}

const W = 720;
const H = 250;
const PAD = { top: 12, right: 12, bottom: 26, left: 34 };

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Round the axis maximum up to a value that divides into whole-number ticks. */
function niceMax(value: number): { max: number; step: number } {
  if (value <= 4) return { max: 4, step: 1 };
  const step = Math.pow(10, Math.floor(Math.log10(value / 4)));
  const scaled = Math.ceil(value / 4 / step);
  const unit = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return { max: unit * step * 4, step: unit * step };
}

/**
 * Reported vs resolved per day. Two lines on one shared axis, a crosshair tooltip on hover, and a visually hidden
 * table so the numbers are available without the chart.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const peak = Math.max(1, ...points.flatMap((p) => [p.created, p.resolved]));
  const { max, step } = niceMax(peak);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const path = (key: 'created' | 'resolved') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const area = `${path('created')} L${x(points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;

  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  function onMove(event: React.MouseEvent) {
    const box = ref.current?.getBoundingClientRect();
    if (!box || points.length === 0) return;
    const svgX = ((event.clientX - box.left) / box.width) * W;
    const index = Math.round(((svgX - PAD.left) / innerW) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, index)));
  }

  const active = hover === null ? null : points[hover];
  return (
    <div className="chart" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Incidents reported and resolved per day">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="axis-text" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.date} className="axis-text" x={x(i)} y={H - 6} textAnchor="middle">{dayLabel(p.date)}</text>
          ) : null,
        )}
        <path className="area-created" d={area} />
        <path className="line-created" d={path('created')} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path className="line-resolved" d={path('resolved')} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && active && (
          <>
            <line className="cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />
            <circle className="dot-created" cx={x(hover)} cy={y(active.created)} r="4.5" />
            <circle className="dot-resolved" cx={x(hover)} cy={y(active.resolved)} r="4.5" />
          </>
        )}
      </svg>
      {hover !== null && active && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: 0 }}>
          <strong>{dayLabel(active.date)}</strong>
          <div className="t-row"><span>Reported</span><b>{active.created}</b></div>
          <div className="t-row"><span>Resolved</span><b>{active.resolved}</b></div>
        </div>
      )}
      <table className="sr-only">
        <caption>Incidents reported and resolved per day</caption>
        <thead><tr><th>Day</th><th>Reported</th><th>Resolved</th></tr></thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}><td>{p.date}</td><td>{p.created}</td><td>{p.resolved}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  color?: string;
  hint?: string;
}

/** Horizontal bars on a shared zero baseline; the number is always printed so colour never carries the value alone. */
export function BarList({ items, empty = 'Nothing to show for this period.' }: { items: BarItem[]; empty?: string }) {
  const peak = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0 || peak === 0) return <div className="empty">{empty}</div>;
  return (
    <div className="bars">
      {items.map((item) => (
        <div className="bar-row" key={item.key} title={item.hint ?? `${item.label}: ${item.value}`}>
          <span className="name">{item.label}</span>
          <span className="num">{item.value}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / peak) * 100}%`, background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
