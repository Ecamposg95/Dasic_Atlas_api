import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import { useConversionCotizaciones } from '../hooks/useConversionCotizaciones';
import { useTopServicios } from '../hooks/useTopServicios';
import { useFantasmasPorProveedor } from '../hooks/useFantasmasPorProveedor';
import { useVencimientosProximos } from '../hooks/useVencimientosProximos';
import { useOrdenesPendientesEntrega } from '../hooks/useOrdenesPendientesEntrega';

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
// Conversión de cotizaciones — KPI cards
// ────────────────────────────────────────────

function ConversionSection({ dias }: { dias: number }) {
  const { data, isLoading } = useConversionCotizaciones(dias);

  if (isLoading) {
    return (
      <Section title="Conversión de cotizaciones">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl p-4 space-y-2"
            >
              <div className="h-3 bg-surface-2 rounded animate-pulse w-24" />
              <div className="h-6 bg-surface-2 rounded animate-pulse w-16" />
            </div>
          ))}
        </div>
      </Section>
    );
  }

  if (!data) return null;

  const kpis = [
    {
      label: 'Total cotizaciones',
      value: String(data.total_cotizaciones),
      sub: `últimos ${data.dias} días`,
    },
    {
      label: 'Tasa conversión',
      value: `${data.tasa_conversion_pct}%`,
      sub: `${data.convertidas} convertidas`,
    },
    {
      label: 'Tasa cancelación',
      value: `${data.tasa_cancelacion_pct}%`,
      sub: `${data.canceladas} canceladas`,
    },
    {
      label: 'Tiempo medio',
      value:
        data.tiempo_medio_conversion_dias != null
          ? `${data.tiempo_medio_conversion_dias}d`
          : '—',
      sub: 'cotiz. → venta',
    },
  ];

  return (
    <Section title="Conversión de cotizaciones">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="bg-card border border-border rounded-xl p-4"
          >
            <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
            <p className="text-2xl font-bold text-accent-glow">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-6 text-sm text-muted-foreground mt-2 flex-wrap">
        <span>
          Monto convertido:{' '}
          <span className="text-foreground font-semibold">
            ${fmt(data.monto_convertido_mxn)} MXN
          </span>
        </span>
        <span>
          Pipeline activo:{' '}
          <span className="text-foreground font-semibold">
            ${fmt(data.monto_pipeline_activo_mxn)} MXN
          </span>
        </span>
      </div>
    </Section>
  );
}

// ────────────────────────────────────────────
// Top servicios
// ────────────────────────────────────────────

function TopServiciosSection({ dias }: { dias: number }) {
  const { data, isLoading } = useTopServicios(dias);
  const items = data?.items ?? [];
  const maxMonto = Math.max(...items.map((i) => i.monto_mxn), 1);

  return (
    <Section title="Top servicios">
      {data && (
        <p className="text-xs text-muted-foreground">
          Total: {data.total_lineas_servicio} líneas ·{' '}
          ${fmt(data.monto_total_servicios_mxn)} MXN
        </p>
      )}
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="px-4 py-3 text-left w-8">#</th>
            <th className="px-4 py-3 text-left">Servicio</th>
            <th className="px-4 py-3 text-right">Líneas</th>
            <th className="px-4 py-3 text-right">Cantidad</th>
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
              Sin servicios en el período
            </DataTableEmpty>
          ) : (
            items.map((row, idx) => (
              <DataTableRow key={`${row.servicio_id ?? 'libre'}-${idx}`}>
                <td className="px-4 py-3 text-muted-foreground text-xs">{idx + 1}</td>
                <td className="px-4 py-3 text-foreground">{row.nombre}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.cantidad_lineas}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.cantidad_total}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                  ${fmt(row.monto_mxn)}
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 bg-surface-2 rounded overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded"
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
// Fantasmas por proveedor
// ────────────────────────────────────────────

function FantasmasSection() {
  const { data, isLoading } = useFantasmasPorProveedor();
  const grupos = data?.grupos ?? [];

  return (
    <Section title="Fantasmas por proveedor">
      {data && (
        <p className="text-xs text-muted-foreground">
          Total pendientes: {data.total_pendientes}
        </p>
      )}
      {isLoading ? (
        <DataTable>
          <DataTableHead>
            <tr>
              <th className="px-4 py-3 text-left">Proveedor</th>
              <th className="px-4 py-3 text-right">Fantasmas</th>
              <th className="px-4 py-3 text-right">Veces solicitado</th>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} cols={3} />
            ))}
          </DataTableBody>
        </DataTable>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Sin fantasmas pendientes
        </p>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <div
              key={grupo.proveedor_id ?? 'sin-asignar'}
              className="space-y-2"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-foreground">
                  {grupo.proveedor_nombre}
                </span>
                <Badge variant="amber">{grupo.cantidad} pendientes</Badge>
                <span className="text-xs text-muted-foreground">
                  {grupo.veces_solicitado_total} solicitudes totales
                </span>
              </div>
              <DataTable>
                <DataTableHead>
                  <tr>
                    <th className="px-4 py-3 text-left">Descripción</th>
                    <th className="px-4 py-3 text-right">Veces solicitado</th>
                    <th className="px-4 py-3 text-right">Costo referencia</th>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {grupo.items.map((item) => (
                    <DataTableRow key={item.id}>
                      <td className="px-4 py-3 text-foreground">
                        {item.descripcion}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {item.veces_solicitado}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {item.moneda === 'USD' ? 'USD ' : '$'}
                        {fmt(item.costo_referencia)}
                      </td>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ────────────────────────────────────────────
// Vencimientos próximos
// ────────────────────────────────────────────

function VencimientosSection({ dias }: { dias: number }) {
  const { data, isLoading } = useVencimientosProximos(dias);
  const items = data?.items ?? [];

  function diasBadge(d: number) {
    if (d < 0) return <Badge variant="rose">{d}d</Badge>;
    if (d < 3) return <Badge variant="amber">{d}d</Badge>;
    return <Badge variant="slate">{d}d</Badge>;
  }

  return (
    <Section title="Vencimientos próximos">
      {data && (
        <p className="text-xs text-muted-foreground">
          {data.total_cotizaciones} cotizaciones · $
          {fmt(data.monto_total_mxn)} MXN en riesgo
        </p>
      )}
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="px-4 py-3 text-left">Folio</th>
            <th className="px-4 py-3 text-left">Cliente</th>
            <th className="px-4 py-3 text-left">Vendedor</th>
            <th className="px-4 py-3 text-right">Total (MXN)</th>
            <th className="px-4 py-3 text-center">Días restantes</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} cols={5} />
            ))
          ) : items.length === 0 ? (
            <DataTableEmpty colSpan={5}>
              Sin vencimientos en {dias} días
            </DataTableEmpty>
          ) : (
            items.map((row) => (
              <DataTableRow key={row.id}>
                <td className="px-4 py-3 font-mono text-xs text-accent-glow">
                  {row.folio}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {row.cliente_nombre ?? '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {row.vendedor_nombre ?? '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                  ${fmt(row.total_mxn)}
                </td>
                <td className="px-4 py-3 text-center">
                  {diasBadge(row.dias_restantes)}
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
// Órdenes pendientes de entrega
// ────────────────────────────────────────────

function OrdenesPendientesSection() {
  const { data, isLoading } = useOrdenesPendientesEntrega();
  const items = data?.items ?? [];

  return (
    <Section title="Órdenes pendientes de entrega">
      {data && (
        <p className="text-xs text-muted-foreground">
          {data.total} órdenes · ${fmt(data.monto_total_mxn)} MXN
        </p>
      )}
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="px-4 py-3 text-left">Folio</th>
            <th className="px-4 py-3 text-left">Cliente</th>
            <th className="px-4 py-3 text-left">Estatus</th>
            <th className="px-4 py-3 text-right">Total (MXN)</th>
            <th className="px-4 py-3 text-right">Días desde venta</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={5} />
            ))
          ) : items.length === 0 ? (
            <DataTableEmpty colSpan={5}>
              Sin órdenes pendientes de entrega
            </DataTableEmpty>
          ) : (
            items.map((row) => (
              <DataTableRow key={row.id}>
                <td className="px-4 py-3 font-mono text-xs text-accent-glow">
                  {row.folio}
                </td>
                <td className="px-4 py-3 text-foreground">
                  {row.cliente_nombre ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="cyan">{row.estatus}</Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-foreground">
                  ${fmt(row.total_mxn)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {row.dias_desde_venta != null ? `${row.dias_desde_venta}d` : '—'}
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

export function ReportesServicioPage({ embedded = false }: { embedded?: boolean }) {
  const [dias, setDias] = useState<number>(30);

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
    <div className={embedded ? 'w-full space-y-8' : 'p-6 max-w-7xl mx-auto w-full space-y-8'}>
      {/* Header — oculto cuando va embebido (KpisPage ya rinde el título de la pestaña) */}
      {embedded ? (
        <div className="flex justify-end">{rangos}</div>
      ) : (
        <header className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-accent-glow" />
            <h1 className="text-2xl font-semibold">Analítica de servicios</h1>
          </div>
          {rangos}
        </header>
      )}

      <ConversionSection dias={dias} />
      <TopServiciosSection dias={dias} />
      <FantasmasSection />
      <VencimientosSection dias={dias} />
      <OrdenesPendientesSection />
    </div>
  );
}
