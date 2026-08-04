import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PipelineResponse } from '../types';

const STAGES: { key: keyof PipelineResponse; label: string; color: string }[] = [
  { key: 'nueva', label: 'Nuevas', color: '#06b6d4' },
  { key: 'seguimiento', label: 'Seguimiento', color: '#94a3b8' },
  { key: 'por_vencer', label: 'Por vencer', color: '#f59e0b' },
  { key: 'vencida', label: 'Vencidas', color: '#f43f5e' },
  { key: 'convertida', label: 'Convertidas', color: '#10b981' },
];

function fmtMoney(n: number) {
  return `MXN $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PipelineDonut({ pipeline, loading }: { pipeline?: PipelineResponse; loading: boolean }) {
  const data = pipeline
    ? STAGES.map((s) => ({ ...s, value: pipeline[s.key].monto_total_mxn, count: pipeline[s.key].count }))
    : [];
  const totalMonto = data.reduce((a, d) => a + d.value, 0);
  const totalCount = data.reduce((a, d) => a + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-cyan-400" /> Pipeline por etapa
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <div className="h-[220px] animate-pulse bg-surface-2 rounded" />
        ) : totalMonto === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">Sin pipeline activo</div>
        ) : (
          <div className="flex items-center gap-4 flex-col sm:flex-row">
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
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, _n, p) => [fmtMoney(Number(val)), (p?.payload as { label?: string })?.label ?? '']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] uppercase text-muted-foreground">Total</span>
                <span className="text-sm font-bold">{totalCount}</span>
              </div>
            </div>
            <ul className="flex-1 space-y-1 w-full">
              {data.map((d) => (
                <li key={d.key} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground flex-1">{d.label}</span>
                  <span className="text-muted-foreground">{d.count}</span>
                  <span className="font-mono text-foreground w-28 text-right">{fmtMoney(d.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
