'use client';

import { CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';
import type { DayOutcome } from '@/lib/types';
import { StackedBarChart } from './stacked-bar-chart';

// Status colors (reserved for state): good / warning / critical. Each series is
// always paired with an icon + label, so color never carries meaning alone.
const SERIES = [
  { key: 'sent', label: 'Sent', color: '#0ca30c', icon: CheckCircle2 },
  { key: 'undeliverable', label: 'Undeliverable', color: '#fab219', icon: TriangleAlert },
  { key: 'failed', label: 'Failed', color: '#d03b3b', icon: XCircle },
] as const;

export function OutcomesChart({ daily }: { daily: DayOutcome[] }) {
  return (
    <StackedBarChart
      rows={daily}
      series={SERIES}
      label="Messages per day by outcome"
      tooltipFooter={(day) => day.received > 0 && <p className="mt-1 border-t border-line pt-1 text-muted">{day.received} replies received</p>}
    />
  );
}
