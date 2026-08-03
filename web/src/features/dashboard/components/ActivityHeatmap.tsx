import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { HeatmapDia } from '../types';

function intensity(v: number, max: number): string {
  if (v <= 0 || max <= 0) return 'bg-surface-2';
  const r = v / max;
  if (r > 0.75) return 'bg-emerald-600';
  if (r > 0.5) return 'bg-emerald-500';
  if (r > 0.25) return 'bg-emerald-400';
  return 'bg-emerald-300 dark:bg-emerald-700';
}

export function ActivityHeatmap({
  days,
  max,
  total,
  loading,
}: {
  days: HeatmapDia[];
  max: number;
  total: number;
  loading: boolean;
}) {
  const weeks: (HeatmapDia | null)[][] = [];
  if (days.length) {
    const first = new Date(days[0].d + 'T00:00:00');
    const lead = first.getDay(); // 0=domingo
    let cur: (HeatmapDia | null)[] = Array(lead).fill(null);
    for (const day of days) {
      cur.push(day);
      if (cur.length === 7) {
        weeks.push(cur);
        cur = [];
      }
    }
    if (cur.length) {
      while (cur.length < 7) cur.push(null);
      weeks.push(cur);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-violet-400" /> Actividad — {total} cotizaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <div className="h-[180px] animate-pulse bg-surface-2 rounded" />
        ) : !days.length ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">Sin actividad</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex gap-1">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((day, di) => (
                    <div
                      key={di}
                      className={`h-3 w-3 rounded-sm ${day ? intensity(day.v, max) : 'bg-transparent'}`}
                      title={day ? `${day.d}: ${day.v} cot.` : ''}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
