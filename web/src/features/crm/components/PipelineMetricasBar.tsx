import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useMetricasPipeline } from '../hooks/useMetricasPipeline';
import type { MetricaMonto } from '../types';

// Franja compacta de métricas del pipeline (una línea en desktop):
// abiertos, ganados y perdidos del período, tasa de conversión + selector 30/90/365 días.

const PERIODOS = [30, 90, 365] as const;

// El backend puede mandar el monto como `monto` o `monto_mxn`, y como string.
function montoDe(m: MetricaMonto | null | undefined): number {
  if (!m) return 0;
  const raw = m.monto ?? m.monto_mxn ?? 0;
  const n = Number(raw);
  return Number.isNaN(n) ? 0 : n;
}

function formatMonto(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

function MetricChip({
  label,
  value,
  monto,
  toneClass,
}: {
  label: string;
  value: string;
  monto?: number;
  toneClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-lg border border-border bg-surface-2/50 px-2.5 py-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={cn('text-sm font-semibold tabular-nums text-foreground', toneClass)}>
        {value}
      </span>
      {monto != null && monto > 0 && (
        <span className="text-[11px] text-muted-foreground tabular-nums">{formatMonto(monto)}</span>
      )}
    </div>
  );
}

export function PipelineMetricasBar({ pipelineId }: { pipelineId: number | null }) {
  const [dias, setDias] = useState<number>(90);
  const { data: metricas, isLoading } = useMetricasPipeline(pipelineId, dias);

  if (pipelineId == null) return null;

  const tasa = metricas != null ? Number(metricas.tasa_ganado_pct) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2 shrink-0">
      {isLoading && !metricas ? (
        <span className="text-xs text-muted-foreground py-0.5">Cargando métricas…</span>
      ) : metricas ? (
        <>
          <MetricChip
            label="Abiertos"
            value={String(metricas.abiertos.count)}
            monto={montoDe(metricas.abiertos)}
          />
          <MetricChip
            label="Ganados"
            value={String(metricas.ganados.count)}
            monto={montoDe(metricas.ganados)}
            toneClass="text-emerald-600 dark:text-emerald-400"
          />
          <MetricChip
            label="Perdidos"
            value={String(metricas.perdidos.count)}
            monto={montoDe(metricas.perdidos)}
            toneClass="text-rose-600 dark:text-rose-400"
          />
          <MetricChip
            label="Conversión"
            value={tasa != null && !Number.isNaN(tasa) ? `${tasa.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%` : '—'}
            toneClass="text-accent-deep dark:text-accent-glow"
          />
        </>
      ) : (
        <span className="text-xs text-muted-foreground py-0.5">Sin métricas disponibles.</span>
      )}

      {/* Selector de período — botones segmentados */}
      <div
        className="ml-auto inline-flex overflow-hidden rounded-lg border border-border"
        role="group"
        aria-label="Período de métricas"
      >
        {PERIODOS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setDias(p)}
            aria-pressed={dias === p}
            className={cn(
              'px-2.5 py-1 text-[11px] font-medium transition-colors',
              dias === p
                ? 'bg-accent-glow/15 text-accent-deep dark:text-accent-glow'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            )}
          >
            {p} d
          </button>
        ))}
      </div>
    </div>
  );
}
