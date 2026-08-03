import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkline } from './Sparkline';

export function KpiCard({
  label,
  value,
  sub,
  loading,
  delta,
  spark,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
  delta?: number | null;
  spark?: number[];
  tone?: 'emerald' | 'cyan' | 'rose' | 'slate';
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">{label}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex items-end justify-between gap-2">
          <CardTitle className={`text-2xl font-bold ${loading ? 'text-muted-foreground/70' : ''}`}>
            {loading ? '—' : value}
          </CardTitle>
          {!loading && delta != null && (
            <span
              className={`text-xs font-semibold flex items-center gap-0.5 ${
                delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-rose-500' : 'text-muted-foreground'
              }`}
            >
              {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : delta < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
              {delta > 0 ? '+' : ''}
              {delta.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </span>
          )}
        </div>
        {!loading && spark && spark.length > 1 && (
          <div className="mt-2">
            <Sparkline data={spark} tone={tone} />
          </div>
        )}
        {sub && <p className="text-xs text-muted-foreground mt-1">{loading ? '' : sub}</p>}
      </CardContent>
    </Card>
  );
}
