import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, AlertTriangle, TrendingUp, Package, CreditCard, BellRing } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/lib/toast';
import { useHero } from '../hooks/useHero';
import { usePipeline } from '../hooks/usePipeline';
import { useAlertas } from '../hooks/useAlertas';
import { useTops } from '../hooks/useTops';
import { useTendencia } from '../hooks/useTendencia';
import { useHeatmap } from '../hooks/useHeatmap';
import { KpiCard } from '../components/KpiCard';
import { TendenciaChart } from '../components/TendenciaChart';
import { PipelineDonut } from '../components/PipelineDonut';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { useResumenRecordatorios, useRecordatorios } from '@/features/recordatorios/hooks/useRecordatorios';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number, moneda = 'MXN') {
  return `${moneda} $${Number(n || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtInt(n: number) {
  return Number(n || 0).toLocaleString('es-MX');
}

function fmtPct(n: number) {
  return `${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function useSafeQuery<T>(
  queryResult: { data: T | undefined; isLoading: boolean; error: unknown },
  label: string,
) {
  const { data, isLoading, error } = queryResult;
  useEffect(() => {
    if (!error) return;
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401) {
      window.location.href = '/spa/login';
      return;
    }
    toast({ kind: 'error', title: `Error cargando ${label}` });
  }, [error, label]);
  return { data, isLoading };
}

// ─── Alert badge severity ──────────────────────────────────────────────────────

type Severity = 'urgente' | 'warning' | 'info';

function severityVariant(s: Severity) {
  if (s === 'urgente') return 'rose' as const;
  if (s === 'warning') return 'amber' as const;
  return 'slate' as const;
}

function severityLabel(s: Severity) {
  if (s === 'urgente') return 'Urgente';
  if (s === 'warning') return 'Aviso';
  return 'Info';
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const heroQ = useSafeQuery(useHero(), 'hero');
  const pipelineQ = useSafeQuery(usePipeline(), 'pipeline');
  const alertasQ = useSafeQuery(useAlertas(), 'alertas');
  const topsQ = useSafeQuery(useTops(), 'tops');
  const tendenciaQ = useSafeQuery(useTendencia(), 'tendencia');
  const heatmapQ = useSafeQuery(useHeatmap(), 'heatmap');
  const resumenRecQ = useSafeQuery(useResumenRecordatorios(), 'recordatorios-resumen');
  const vencidosRecQ = useSafeQuery(useRecordatorios('vencidos'), 'recordatorios-vencidos');
  const hoyRecQ = useSafeQuery(useRecordatorios('hoy'), 'recordatorios-hoy');

  const hero = heroQ.data;
  const pipeline = pipelineQ.data;
  const alertas = alertasQ.data;
  const tops = topsQ.data;

  // ── Alertas unificadas ──────────────────────────────────────────────────────
  type AlertaItem = {
    key: string;
    severity: Severity;
    text: string;
    link?: string;
  };

  const alertItems: AlertaItem[] = [];

  if (alertas) {
    (alertas.por_vencer_3d ?? []).forEach((o) => {
      const dias = o.dias_restantes;
      const severity: Severity = dias !== null && dias <= 0 ? 'urgente' : dias !== null && dias <= 1 ? 'urgente' : 'warning';
      alertItems.push({
        key: `vencer-${o.id}`,
        severity,
        text: `Cotización ${o.folio} (${o.cliente}) vence en ${dias !== null ? `${dias}d` : '—'}`,
        link: `/spa/seguimiento`,
      });
    });

    (alertas.stock_critico_cotizado ?? []).forEach((p) => {
      alertItems.push({
        key: `stock-${p.producto_id}`,
        severity: 'warning',
        text: `${p.nombre} (${p.sku}): stock ${p.stock_actual} ≤ mínimo ${p.stock_minimo}, ${p.cotizaciones_activas} cot. activas`,
        link: `/spa/inventario`,
      });
    });

    (alertas.saldos_vencidos ?? []).forEach((c) => {
      const severity: Severity = c.dias_sin_pago > 90 ? 'urgente' : 'warning';
      alertItems.push({
        key: `saldo-${c.id}`,
        severity,
        text: `${c.empresa}: saldo ${fmtMoney(c.saldo)} sin pago hace ${c.dias_sin_pago} días`,
        link: `/spa/cuentas-por-cobrar`,
      });
    });

    (alertas.oc_borrador ?? []).forEach((oc) => {
      alertItems.push({
        key: `oc-${oc.id}`,
        severity: 'info',
        text: `OC borrador ${oc.folio}${oc.proveedor ? ` (${oc.proveedor})` : ''} — ${fmtMoney(oc.total, oc.moneda)}`,
        link: `/spa/compras`,
      });
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-accent-glow" />
            Dashboard
          </span>
        }
        description="Centro de trabajo — cada indicador navega a su vista de detalle"
        className="mb-0"
      />

      {/* Row 1: KPIs hero */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3">
          Ventas — mes actual
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Ventas del mes"
            value={fmtMoney(hero?.ventas.monto_mxn ?? 0)}
            sub={hero ? `${fmtInt(hero.ventas.count)} órdenes` : undefined}
            delta={hero?.ventas.delta_pct ?? null}
            spark={hero?.ventas.sparkline_30d?.map((p) => p.v)}
            tone="emerald"
            loading={heroQ.isLoading}
            to="/spa/analitica?tab=ventas"
          />
          <KpiCard
            label="Pipeline abierto"
            value={fmtMoney(hero?.pipeline.monto_mxn ?? 0)}
            sub={hero ? `${fmtInt(hero.pipeline.count)} cotizaciones · ticket prom. ${fmtMoney(hero.pipeline.ticket_promedio_mxn)}` : undefined}
            loading={heroQ.isLoading}
            to="/spa/seguimiento"
          />
          <KpiCard
            label="Conversión 30d"
            value={fmtPct(hero?.conversion.tasa_pct ?? 0)}
            sub={hero ? `Meta: ${fmtPct(hero.conversion.target_pct)}` : undefined}
            spark={hero?.conversion.sparkline_4w}
            tone="cyan"
            loading={heroQ.isLoading}
            to="/spa/analitica?tab=ventas"
          />
          <KpiCard
            label="Margen prom."
            value={fmtPct(hero?.margen.pct ?? 0)}
            sub={hero ? `${fmtInt(hero.margen.muestra_lineas)} líneas` : undefined}
            loading={heroQ.isLoading}
          />
        </div>
      </section>

      {/* Row 2: Tendencia */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3">
          Tendencia (12 meses)
        </h2>
        <TendenciaChart series={tendenciaQ.data?.series ?? []} loading={tendenciaQ.isLoading} />
      </section>

      {/* Row 3: Pipeline donut + Heatmap */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PipelineDonut pipeline={pipeline} loading={pipelineQ.isLoading} />
          <ActivityHeatmap
            days={heatmapQ.data?.days ?? []}
            max={heatmapQ.data?.max ?? 0}
            total={heatmapQ.data?.total ?? 0}
            loading={heatmapQ.isLoading}
          />
        </div>
      </section>

      {/* Row 4: Alertas */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          Alertas
        </h2>
        {alertasQ.isLoading ? (
          <div className="text-muted-foreground/70 text-sm">Cargando alertas…</div>
        ) : alertItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin alertas activas.</p>
        ) : (
          <div className="space-y-2">
            {alertItems.map((a) => (
              <div
                key={a.key}
                className="flex items-start gap-3 bg-card border border-border rounded-lg px-3 py-2"
              >
                <Badge variant={severityVariant(a.severity)} className="mt-0.5 shrink-0">
                  {severityLabel(a.severity)}
                </Badge>
                <span className="text-sm text-foreground flex-1 leading-snug">{a.text}</span>
                {a.link && (
                  <Link to={a.link} className="text-xs text-cyan-400 hover:text-cyan-300 shrink-0 self-center">
                    ver →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Row 5: Recordatorios */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3 flex items-center gap-1">
          <BellRing className="h-3.5 w-3.5 text-cyan-400" />
          Recordatorios
        </h2>
        <Card>
          <CardContent className="px-4 py-3 space-y-3">
            {/* Summary counts */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5">
                <Badge variant="rose">{resumenRecQ.data?.vencidos ?? 0}</Badge>
                <span className="text-xs text-muted-foreground">vencidos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="amber">{resumenRecQ.data?.hoy ?? 0}</Badge>
                <span className="text-xs text-muted-foreground">hoy</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="slate">{resumenRecQ.data?.proximos_7d ?? 0}</Badge>
                <span className="text-xs text-muted-foreground">próximos 7d</span>
              </div>
              <Link
                to="/spa/recordatorios"
                className="ml-auto text-xs text-cyan-500 hover:text-cyan-400 self-center"
              >
                ver todos →
              </Link>
            </div>

            {/* Top 5 overdue + today items */}
            {(vencidosRecQ.isLoading || hoyRecQ.isLoading) ? (
              <p className="text-xs text-muted-foreground/70">Cargando…</p>
            ) : (
              (() => {
                const items = [
                  ...(vencidosRecQ.data ?? []),
                  ...(hoyRecQ.data ?? []),
                ].slice(0, 5);
                if (items.length === 0) return (
                  <p className="text-xs text-muted-foreground">Sin recordatorios urgentes.</p>
                );
                return (
                  <ul className="space-y-1.5">
                    {items.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-xs">
                        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${r.dias < 0 ? 'bg-rose-500' : 'bg-amber-400'}`} />
                        <span className="font-mono text-muted-foreground shrink-0">
                          {r.folio ?? `#${r.orden_id}`}
                        </span>
                        <span className="text-foreground truncate flex-1">
                          {r.cliente ?? '—'}
                        </span>
                        <span className="text-muted-foreground/70 shrink-0">
                          {r.dias < 0 ? `−${Math.abs(r.dias)}d` : 'hoy'}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              })()
            )}
          </CardContent>
        </Card>
      </section>

      {/* Row 6: Tops */}
      <section>
        <h2 className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3">
          Tops del mes
        </h2>
        <div className={`grid gap-4 ${tops?.ve_equipo ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {/* Top Productos */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Package className="h-4 w-4 text-violet-400" />
                Top productos cotizados
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {topsQ.isLoading ? (
                <p className="text-muted-foreground/70 text-sm">Cargando…</p>
              ) : !tops?.productos.length ? (
                <p className="text-muted-foreground text-sm">Sin datos</p>
              ) : (
                <ol className="space-y-2">
                  {tops.productos.map((p, i) => (
                    <li key={p.id} className="flex items-start gap-2 text-sm">
                      <span className="text-xs text-muted-foreground/70 w-4 pt-0.5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-medium text-foreground truncate">{p.nombre}</span>
                          {p.stock_riesgo && <Badge variant="rose">Stock bajo</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">
                          {p.sku}{p.marca ? ` · ${p.marca}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtInt(p.cantidad_total)} uds en {p.apariciones} cot.
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Top Clientes */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Top clientes del mes
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {topsQ.isLoading ? (
                <p className="text-muted-foreground/70 text-sm">Cargando…</p>
              ) : !tops?.clientes.length ? (
                <p className="text-muted-foreground text-sm">Sin datos</p>
              ) : (
                <ol className="space-y-2">
                  {tops.clientes.map((c, i) => (
                    <li key={c.id} className="flex items-start gap-2 text-sm">
                      <span className="text-xs text-muted-foreground/70 w-4 pt-0.5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{c.empresa}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtMoney(c.monto_mxn)} · {fmtInt(c.orden_count)} orden(es)
                        </p>
                        {c.saldo > 0 && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">Saldo: {fmtMoney(c.saldo)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* Top Vendedores — solo admin/gerente */}
          {tops?.ve_equipo && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-cyan-400" />
                  Top vendedores del mes
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {topsQ.isLoading ? (
                  <p className="text-muted-foreground/70 text-sm">Cargando…</p>
                ) : !tops.vendedores.length ? (
                  <p className="text-muted-foreground text-sm">Sin datos</p>
                ) : (
                  <ol className="space-y-2">
                    {tops.vendedores.map((v, i) => (
                      <li key={v.id} className="flex items-start gap-2 text-sm">
                        <span className="text-xs text-muted-foreground/70 w-4 pt-0.5">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{v.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtMoney(v.monto_mxn)} · {fmtInt(v.orden_count)} venta(s)
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
