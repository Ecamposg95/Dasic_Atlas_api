import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TendenciaPunto } from '../types';

function fmtCompact(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

export function TendenciaChart({ series, loading }: { series: TendenciaPunto[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-emerald-400" /> Tendencia — ventas vs cotizaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        {loading ? (
          <div className="h-[260px] animate-pulse bg-surface-2 rounded" />
        ) : !series.length ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
            Sin datos del periodo
          </div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="g-ventas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={fmtCompact}
                  tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  formatter={(val, name) => [
                    `MXN $${Number(val).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
                    name === 'ventas_mxn' ? 'Ventas' : 'Cotizaciones',
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend formatter={(v) => (v === 'ventas_mxn' ? 'Ventas' : 'Cotizaciones')} wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="ventas_mxn"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#g-ventas)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="cotizaciones_mxn"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
