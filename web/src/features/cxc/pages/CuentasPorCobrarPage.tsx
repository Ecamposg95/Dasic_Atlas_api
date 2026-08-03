import { useMutation, useQueryClient } from '@tanstack/react-query';
import { confirm } from '@/lib/confirm';
import { Wallet, AlertTriangle, Clock, Users, RefreshCw, TrendingDown } from 'lucide-react';
import { useResumenCxC } from '../hooks/useResumenCxC';
import { useVencimientosCxC } from '../hooks/useVencimientosCxC';
import { useAgingCxC } from '../hooks/useAgingCxC';
import { useTopDeudores } from '../hooks/useTopDeudores';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useIsAdmin } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import { AgingDonut } from '../components/AgingDonut';
import { AgingBuckets } from '../components/AgingBuckets';
import { TopDeudoresTable } from '../components/TopDeudoresTable';
import type { MarcarVencidosResponse, VencimientoItem } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMXN(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function diasRestantes(fechaVenc: string | null): number | null {
  if (!fechaVenc) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVenc + 'T00:00:00Z');
  return Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  Icon: React.ElementType;
  color?: string;
  loading?: boolean;
}

function KpiCard({ label, value, sub, Icon, color = 'text-accent-glow', loading }: KpiProps) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
            {loading ? (
              <div className="h-8 w-32 bg-surface-2 rounded animate-pulse" />
            ) : (
              <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            )}
            {sub && !loading && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <Icon className={`h-6 w-6 flex-shrink-0 ${color} opacity-70 mt-1`} />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fila de vencimiento
// ---------------------------------------------------------------------------

function VencimientoRow({ item }: { item: VencimientoItem }) {
  const dias = diasRestantes(item.fecha_vencimiento);

  let diasBadge: React.ReactNode = null;
  if (dias === null) {
    diasBadge = <Badge variant="slate">Sin fecha</Badge>;
  } else if (dias < 0) {
    diasBadge = <Badge variant="rose">{Math.abs(dias)}d vencido</Badge>;
  } else if (dias <= 3) {
    diasBadge = <Badge variant="amber">{dias}d</Badge>;
  } else {
    diasBadge = <Badge variant="slate">{dias}d</Badge>;
  }

  return (
    <DataTableRow>
      <td className="px-4 py-3 text-foreground text-sm font-mono">
        {item.orden_venta_id ? (
          <a
            href={`/api/ventas/${item.orden_venta_id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="text-accent-glow hover:underline"
          >
            OV-{item.orden_venta_id}
          </a>
        ) : (
          <span className="text-muted-foreground/70 italic">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-foreground text-sm">{item.cliente ?? '—'}</td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium">
        ${fmtMXN(item.saldo_pendiente)}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtFecha(item.fecha_vencimiento)}</td>
      <td className="px-4 py-3">{diasBadge}</td>
    </DataTableRow>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-surface-2 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Section header helper
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
      {children}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// Página principal — Centro de cobranza
// ---------------------------------------------------------------------------

export function CuentasPorCobrarPage() {
  const isAdmin = useIsAdmin();

  const qc = useQueryClient();
  const { data: resumen, isLoading: loadingResumen } = useResumenCxC();
  const { data: vencimientos, isLoading: loadingVenc } = useVencimientosCxC(365);
  const { data: aging, isLoading: loadingAging } = useAgingCxC();
  const { data: topDeudores, isLoading: loadingTop } = useTopDeudores(10);

  const marcarMutation = useMutation({
    mutationFn: () => api.post<MarcarVencidosResponse>('/api/cuentas-por-cobrar/marcar-vencidos'),
    onSuccess: (data) => {
      toast({
        kind: 'success',
        title: `Marcados como vencidos: ${data.actualizados} cargo(s)`,
      });
      void qc.invalidateQueries({ queryKey: ['cxc-resumen'] });
      void qc.invalidateQueries({ queryKey: ['cxc-vencimientos'] });
      void qc.invalidateQueries({ queryKey: ['cxc-aging'] });
      void qc.invalidateQueries({ queryKey: ['cxc-top-deudores'] });
    },
    onError: (err) => {
      const status = (err as { status?: number }).status;
      if (status === 403) {
        toast({ kind: 'error', title: 'Sin permiso' });
      } else {
        const detail = (err as { detail?: string }).detail ?? 'Error al marcar vencidos';
        toast({ kind: 'error', title: detail });
      }
    },
  });

  async function handleMarcarVencidos() {
    if (
      !(await confirm({
        mensaje: '¿Marcar como vencidos todos los cargos con fecha de vencimiento pasada? Esta operación es idempotente.',
        tono: 'warning',
      }))
    )
      return;
    marcarMutation.mutate();
  }

  const items = vencimientos?.items ?? [];
  const agingBuckets = aging?.buckets ?? [];
  const deudores = topDeudores ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-8">
      {/* ---------------------------------------------------------------- */}
      {/* 1. Header                                                         */}
      {/* ---------------------------------------------------------------- */}
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <TrendingDown className="h-6 w-6 text-accent-glow" />
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Centro de cobranza</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cuentas por cobrar · Aging · Top deudores
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant="secondary"
            disabled={marcarMutation.isPending}
            onClick={handleMarcarVencidos}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            {marcarMutation.isPending ? 'Procesando…' : 'Marcar vencidos'}
          </Button>
        )}
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* 2. KPI cards                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total por cobrar"
            value={`$${fmtMXN(resumen?.total_pendiente ?? 0)}`}
            sub="MXN"
            Icon={Wallet}
            color="text-accent-glow"
            loading={loadingResumen}
          />
          <KpiCard
            label="Vencido"
            value={`$${fmtMXN(resumen?.total_vencido ?? 0)}`}
            sub="MXN"
            Icon={AlertTriangle}
            color="text-rose-600 dark:text-rose-400"
            loading={loadingResumen}
          />
          <KpiCard
            label="Por vencer (7d)"
            value={`$${fmtMXN(resumen?.por_vencer_7d ?? 0)}`}
            sub="MXN"
            Icon={Clock}
            color="text-amber-600 dark:text-amber-400"
            loading={loadingResumen}
          />
          <KpiCard
            label="Clientes con saldo"
            value={String(resumen?.n_cargos_abiertos ?? 0)}
            sub="cargos abiertos"
            Icon={Users}
            color="text-foreground"
            loading={loadingResumen}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3. Aging                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionTitle>Antigüedad de saldo (aging)</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AgingDonut buckets={agingBuckets} loading={loadingAging} />
          <div className="flex items-center">
            <div className="w-full">
              <AgingBuckets buckets={agingBuckets} loading={loadingAging} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4. Top deudores                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section>
        <SectionTitle>Top deudores</SectionTitle>
        <TopDeudoresTable deudores={deudores} loading={loadingTop} />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 5. Vencimientos pendientes                                        */}
      {/* ---------------------------------------------------------------- */}
      <section>
        <SectionTitle>Vencimientos pendientes</SectionTitle>
        <DataTable maxBodyHeight="calc(100vh - 20rem)">
          <DataTableHead sticky>
            <tr>
              <th className="px-4 py-3 text-left">Folio OV</th>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3 text-left">Vencimiento</th>
              <th className="px-4 py-3 text-left">Días restantes</th>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {loadingVenc ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : items.length === 0 ? (
              <DataTableEmpty colSpan={5}>
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Wallet className="h-10 w-10 opacity-30" />
                  <p>Sin vencimientos pendientes</p>
                </div>
              </DataTableEmpty>
            ) : (
              items.map((item) => <VencimientoRow key={item.id} item={item} />)
            )}
          </DataTableBody>
        </DataTable>
      </section>
    </div>
  );
}
