// Donut chart para el reporte de aging de CxC.
// Reutiliza el patrón de PipelineDonut (recharts Pie + leyenda inline).

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock } from 'lucide-react';
import type { AgingBucket } from '../types';

const BUCKET_CONFIG: Record<
  string,
  { label: string; color: string; dotClass: string }
> = {
  '0-30': { label: '0 – 30 días', color: '#10b981', dotClass: 'bg-emerald-500' },
  '31-60': { label: '31 – 60 días', color: '#f59e0b', dotClass: 'bg-amber-500' },
  '61-90': { label: '61 – 90 días', color: '#f97316', dotClass: 'bg-orange-500' },
  '90+': { label: '90+ días', color: '#f43f5e', dotClass: 'bg-rose-500' },
};

function fmtMXN(n: number): string {
  return `$${Number(n || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Props {
  buckets: AgingBucket[];
  loading: boolean;
}

export function AgingDonut({ buckets, loading }: Props) {
  const data = buckets.map((b) => {
    const cfg = BUCKET_CONFIG[b.rango] ?? { label: b.rango, color: '#94a3b8', dotClass: 'bg-muted-foreground' };
    return { ...cfg, rango: b.rango, value: b.monto, count: b.count };
  });

  const totalMonto = data.reduce((a, d) => a + d.value, 0);
  const totalCount = data.reduce((a, d) => a + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-accent-glow" /> Antigüedad de saldo
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-[200px]" />
        ) : totalMonto === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            Sin saldos pendientes
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-col sm:flex-row">
            {/* Donut */}
            <div className="relative h-[180px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={58}
                    outerRadius={84}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {data.map((d) => (
                      <Cell key={d.rango} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, _n, p) => [
                      fmtMXN(Number(val)),
                      (p?.payload as { label?: string })?.label ?? '',
                    ]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Centro */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase text-muted-foreground">Cargos</span>
                <span className="text-sm font-bold">{totalCount}</span>
              </div>
            </div>

            {/* Leyenda */}
            <ul className="flex-1 space-y-1.5 w-full">
              {data.map((d) => (
                <li key={d.rango} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-muted-foreground flex-1">{d.label}</span>
                  <span className="text-muted-foreground/70">{d.count} cargos</span>
                  <span className="font-mono text-foreground w-32 text-right">
                    {fmtMXN(d.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
