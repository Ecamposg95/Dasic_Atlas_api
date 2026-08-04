import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useIsAdminOrGerente } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import { useVentasMes } from '../hooks/useVentasMes';
import { useTopProductos } from '../hooks/useTopProductos';
import { useTopClientes } from '../hooks/useTopClientes';
import { useRankingVendedores } from '../hooks/useRankingVendedores';
import type { ApiError } from '@/lib/api';

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-surface-2 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

// ────────────────────────────────────────────
// Section container
// ────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

// ────────────────────────────────────────────
// Ventas por mes
// ────────────────────────────────────────────

function VentasMesSection({
  dias,
  isAdmin,
}: {
  dias: number;
  isAdmin: boolean;
}) {
  // Map the days range selector to months for the ventas-mes endpoint
  const meses = dias === 7 ? 1 : dias === 30 ? 3 : 6;
  const { data, isLoading } = useVentasMes(meses);
  const series = data?.series ?? [];

  return (
    <Section title="Ventas por mes">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Mostrando {meses} {meses === 1 ? 'mes' : 'meses'}
        </p>
        {isAdmin && (
          <a
            href={`/api/reportes/ventas-mes/csv?meses=${meses}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline" size="sm">
              Exportar CSV
            </Button>
          </a>
        )}
      </div>
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="px-4 py-3 text-left">Mes</th>
            <th className="px-4 py-3 text-right"># Cotizaciones</th>
            <th className="px-4 py-3 text-right">Monto cot. (MXN)</th>
            <th className="px-4 py-3 text-right"># Ventas</th>
            <th className="px-4 py-3 text-right">Monto vtas. (MXN)</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} cols={5} />
            ))
          ) : series.length === 0 ? (
            <DataTableEmpty colSpan={5}>Sin datos en el período</DataTableEmpty>
          ) : (
            series.map((row) => (
              <DataTableRow key={row.mes}>
                <td className="px-4 py-3 font-medium text-foreground">
                  {row.label}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.cotizaciones_count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  ${fmt(row.cotizaciones_mxn)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.ventas_count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-accent-glow font-semibold">
                  ${fmt(row.ventas_mxn)}
                </td>
              </DataTableRow>
            ))
          )}
        </DataTableBody>
      </DataTable>
    </Section>
  );
}

// ────────────────────────────────────────────
// Top productos
// ────────────────────────────────────────────

function TopProductosSection({ dias }: { dias: number }) {
  const { data, isLoading } = useTopProductos(dias);
  const items = data ?? [];
  const maxMonto = Math.max(...items.map((i) => i.monto_mxn), 1);

  return (
    <Section title="Top productos">
      <DataTable maxBodyHeight="18rem">
        <DataTableHead sticky>
          <tr>
            <th className="px-4 py-3 text-left w-8">#</th>
            <th className="px-4 py-3 text-left">SKU / Producto</th>
            <th className="px-4 py-3 text-right">Cantidad</th>
            <th className="px-4 py-3 text-right">Órdenes</th>
            <th className="px-4 py-3 text-right">Monto (MXN)</th>
            <th className="px-4 py-3 w-32"></th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={6} />
            ))
          ) : items.length === 0 ? (
            <DataTableEmpty colSpan={6}>
              Sin productos en el período
            </DataTableEmpty>
          ) : (
            items.map((row, idx) => (
              <DataTableRow key={row.producto_id}>
                <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-accent-glow">
                    {row.sku}
                  </span>
                  <span className="ml-2 text-foreground">{row.nombre}</span>
                  {row.marca && (
                    <span className="ml-1 text-muted-foreground text-xs">
                      · {row.marca}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.cantidad_total}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.apariciones}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                  ${fmt(row.monto_mxn)}
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 bg-surface-2 rounded overflow-hidden">
                    <div
                      className="h-full bg-accent-glow rounded"
                      style={{
                        width: `${Math.round((row.monto_mxn / maxMonto) * 100)}%`,
                      }}
                    />
                  </div>
                </td>
              </DataTableRow>
            ))
          )}
        </DataTableBody>
      </DataTable>
    </Section>
  );
}

// ────────────────────────────────────────────
// Top clientes
// ────────────────────────────────────────────

function TopClientesSection({ dias }: { dias: number }) {
  const { data, isLoading } = useTopClientes(dias);
  const items = data ?? [];
  const maxMonto = Math.max(...items.map((i) => i.monto_mxn), 1);

  return (
    <Section title="Top clientes">
      <DataTable maxBodyHeight="18rem">
        <DataTableHead sticky>
          <tr>
            <th className="px-4 py-3 text-left w-8">#</th>
            <th className="px-4 py-3 text-left">Empresa</th>
            <th className="px-4 py-3 text-right">Órdenes</th>
            <th className="px-4 py-3 text-right">Monto (MXN)</th>
            <th className="px-4 py-3 text-right">Saldo actual</th>
            <th className="px-4 py-3 w-32"></th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={6} />
            ))
          ) : items.length === 0 ? (
            <DataTableEmpty colSpan={6}>
              Sin clientes en el período
            </DataTableEmpty>
          ) : (
            items.map((row, idx) => (
              <DataTableRow key={row.cliente_id}>
                <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                <td className="px-4 py-3 text-foreground">{row.empresa}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.orden_count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                  ${fmt(row.monto_mxn)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  ${fmt(row.saldo_actual)}
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 bg-surface-2 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded"
                      style={{
                        width: `${Math.round((row.monto_mxn / maxMonto) * 100)}%`,
                      }}
                    />
                  </div>
                </td>
              </DataTableRow>
            ))
          )}
        </DataTableBody>
      </DataTable>
    </Section>
  );
}

// ────────────────────────────────────────────
// Ranking vendedores (admin only)
// ────────────────────────────────────────────

function RankingVendedoresSection({ dias }: { dias: number }) {
  const { data, isLoading, error } = useRankingVendedores(dias);
  const apiError = error as ApiError | null;

  if (apiError?.status === 403) {
    return (
      <Section title="Ranking vendedores">
        <p className="text-sm text-muted-foreground italic">Solo admin</p>
      </Section>
    );
  }
  if (apiError?.status === 401) {
    window.location.href = '/';
    return null;
  }

  const items = data ?? [];
  const maxMonto = Math.max(...items.map((i) => i.monto_mxn), 1);

  return (
    <Section title="Ranking vendedores">
      <DataTable maxBodyHeight="18rem">
        <DataTableHead sticky>
          <tr>
            <th className="px-4 py-3 text-left w-8">#</th>
            <th className="px-4 py-3 text-left">Vendedor</th>
            <th className="px-4 py-3 text-right">Órdenes</th>
            <th className="px-4 py-3 text-right">Monto (MXN)</th>
            <th className="px-4 py-3 w-32"></th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} cols={5} />
            ))
          ) : items.length === 0 ? (
            <DataTableEmpty colSpan={5}>Sin ventas en el período</DataTableEmpty>
          ) : (
            items.map((row, idx) => (
              <DataTableRow key={row.usuario_id}>
                <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                <td className="px-4 py-3">
                  <span className="text-foreground">{row.nombre}</span>
                  <span className="ml-2 text-muted-foreground text-xs">
                    {row.email}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.orden_count}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                  ${fmt(row.monto_mxn)}
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 bg-surface-2 rounded overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded"
                      style={{
                        width: `${Math.round((row.monto_mxn / maxMonto) * 100)}%`,
                      }}
                    />
                  </div>
                </td>
              </DataTableRow>
            ))
          )}
        </DataTableBody>
      </DataTable>
    </Section>
  );
}

// ────────────────────────────────────────────
// Días selector
// ────────────────────────────────────────────

const RANGOS = [
  { label: '7 días', value: 7 },
  { label: '30 días', value: 30 },
  { label: '90 días', value: 90 },
] as const;

// ────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────

export function ReportesPage({ embedded = false }: { embedded?: boolean }) {
  const [dias, setDias] = useState<number>(30);
  // Reportes muestra totales de ventas/utilidad a admin + gerente comercial.
  const isAdmin = useIsAdminOrGerente();

  const rangos = (
    <div className="flex items-center gap-2">
      {RANGOS.map((r) => (
        <button
          key={r.value}
          onClick={() => setDias(r.value)}
          className={`px-3 py-1.5 rounded-lg text-sm transition ${
            dias === r.value
              ? 'bg-accent-glow/20 text-accent-glow font-semibold border border-accent-glow/40'
              : 'bg-surface-2 text-muted-foreground hover:bg-border'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={embedded ? 'w-full space-y-5' : 'p-6 max-w-7xl mx-auto w-full space-y-5'}>
      {/* Header — oculto cuando va embebido (KpisPage ya rinde el título de la pestaña) */}
      {embedded ? (
        <div className="flex justify-end">{rangos}</div>
      ) : (
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <BarChart3 className="h-6 w-6 text-accent-glow" />
              Reportes
            </span>
          }
          actions={rangos}
        />
      )}

      <VentasMesSection dias={dias} isAdmin={isAdmin} />
      <div className="grid xl:grid-cols-2 gap-5 items-start">
        <TopProductosSection dias={dias} />
        <TopClientesSection dias={dias} />
        <RankingVendedoresSection dias={dias} />
      </div>
    </div>
  );
}
