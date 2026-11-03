'use client';

import { Table2, type LucideIcon } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';

export interface ChartSeries<K extends string> {
  key: K;
  label: string;
  /** A CSS color, e.g. "#0ca30c" or "var(--series-1)". */
  color: string;
  /** Shown beside the label, so color never carries the meaning alone. */
  icon?: LucideIcon;
}

type Row<K extends string> = { date: string } & Record<K, number>;

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 32 };
const GAP = 2; // surface gap between stacked segments

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

// Stacked bars per day with a legend, a hover tooltip and a table view.
export function StackedBarChart<K extends string, R extends Row<K> = Row<K>>({
  rows,
  series,
  label,
  tooltipFooter,
}: {
  rows: R[];
  series: readonly ChartSeries<K>[];
  label: string;
  tooltipFooter?: (row: R) => ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = rows.map((d) => series.reduce((sum, s) => sum + d[s.key], 0));
  const max = niceMax(Math.max(0, ...totals));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / rows.length;
  const barW = Math.max(3, Math.min(28, slot * 0.6));
  const y = (v: number) => (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(rows.length / 7);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.icon && <s.icon className="size-3.5" aria-hidden />} {s.label}
            </li>
          ))}
        </ul>
        <button onClick={() => setTable(!table)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-subtle hover:text-ink">
          <Table2 className="size-3.5" /> {table ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {table ? (
        <div className="max-h-64 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.key} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...rows].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="px-3 py-1.5 text-ink">{shortDate(d.date)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right tabular-nums text-ink">
                      {d[s.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={PAD.top + plotH - y(t)} y2={PAD.top + plotH - y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : '2 4'} />
                <text x={PAD.left - 8} y={PAD.top + plotH - y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                  {Math.round(t)}
                </text>
              </g>
            ))}
            {rows.map((d, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              let base = PAD.top + plotH;
              const segments = series.filter((s) => d[s.key] > 0);
              return (
                <g key={d.date}>
                  {hover === i && <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill="var(--subtle)" />}
                  {segments.map((s, j) => {
                    const h = Math.max(2, y(d[s.key]) - (j < segments.length - 1 ? GAP : 0));
                    base -= y(d[s.key]);
                    const top = j === segments.length - 1;
                    const yTop = base + (j < segments.length - 1 ? GAP : 0);
                    const r = Math.min(4, barW / 2, h / 2);
                    return top ? (
                      <path
                        key={s.key}
                        d={`M${cx - barW / 2},${yTop + h} V${yTop + r} Q${cx - barW / 2},${yTop} ${cx - barW / 2 + r},${yTop} H${cx + barW / 2 - r} Q${cx + barW / 2},${yTop} ${cx + barW / 2},${yTop + r} V${yTop + h} Z`}
                        fill={s.color}
                      />
                    ) : (
                      <rect key={s.key} x={cx - barW / 2} y={yTop} width={barW} height={h} fill={s.color} />
                    );
                  })}
                  {i % labelEvery === (rows.length - 1) % labelEvery && (
                    <text x={cx} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                      {shortDate(d.date)}
                    </text>
                  )}
                  {/* Hit target wider than the bar. */}
                  <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div
              className={cn('pointer-events-none absolute top-2 z-10 min-w-44 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lift')}
              style={{ left: `clamp(0px, calc(${((PAD.left + slot * hover + slot / 2) / WIDTH) * 100}% - 88px), calc(100% - 184px))` }}
            >
              <p className="mb-1 font-semibold text-ink">{shortDate(rows[hover].date)}</p>
              {series.map((s) => (
                <p key={s.key} className="flex items-center justify-between gap-4 text-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm" style={{ background: s.color }} /> {s.label}
                  </span>
                  <span className="tabular-nums text-ink">{rows[hover][s.key]}</span>
                </p>
              ))}
              {tooltipFooter?.(rows[hover])}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
