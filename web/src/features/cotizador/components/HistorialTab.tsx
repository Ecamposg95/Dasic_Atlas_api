import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Search,
  FileText,
  ShoppingBag,
  RefreshCw,
  Settings,
  Hash,
  User,
  CircleDot,
  Coins,
  CalendarDays,
  GitBranch,
  Zap,
  ClipboardCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { confirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import type { ApiError } from '@/lib/api';
import { useHistorial } from '../hooks/useHistorial';
import { useConvertir } from '../hooks/useConvertir';
import { useRecotizar } from '../hooks/useRecotizar';
import { useSugerirOC } from '../hooks/useSugerirOC';
import { SugerirOCModal } from './SugerirOCModal';
import type { EstatusOrden, HistorialFiltros, OrdenHistorial, SugerirOCResponse } from '../types';

const ESTATUS_OPCIONES: Array<{ key: EstatusOrden | ''; label: string }> = [
  { key: '', label: 'Todos' },
  { key: 'cotizacion', label: 'Cotización' },
  { key: 'pendiente', label: 'Venta (pendiente cobro)' },
  { key: 'pagada', label: 'Pagada' },
  { key: 'cancelada', label: 'Cancelada' },
];

const ESTATUS_CLASS: Record<EstatusOrden, string> = {
  cotizacion: 'bg-accent-glow/10 text-accent-glow border border-accent-glow/40',
  pendiente: 'bg-amber-900/30 text-amber-300 border border-amber-700/50',
  pagada: 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/50',
  cancelada: 'bg-surface-2 text-muted-foreground border border-border-strong',
};

function badgeEstatus(estatus: EstatusOrden) {
  const cls = ESTATUS_CLASS[estatus] ?? 'bg-surface-2 text-muted-foreground border border-border-strong';
  return `text-[10px] font-bold uppercase px-2 py-0.5 rounded ${cls}`;
}

function fmtMoney(n: number, m: string) {
  return `${m} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return s;
  }
}

// Compara una fecha ISO contra un YYYY-MM-DD (>= desde / <= hasta).
function inRangeISO(iso: string, desde?: string, hasta?: string): boolean {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}

export function HistorialTab({ clienteIdFiltro: _clienteIdFiltro }: { clienteIdFiltro: number | null }) {
  // El endpoint /historial actual no devuelve cliente_id, así que el filtro
  // por cliente del editor (`_clienteIdFiltro`) no se aplica server-side ni
  // client-side por ahora. Se mantiene en la firma para futura extensión
  // cuando el backend exponga el id.
  void _clienteIdFiltro;

  const [filtros, setFiltros] = useState<HistorialFiltros>({
    estatus: '',
    page: 1,
    page_size: 25,
  });
  const [sugerirOpen, setSugerirOpen] = useState<{ cotId: number; folio: string; data: SugerirOCResponse } | null>(null);
  const navigate = useNavigate();

  const { data, isLoading, error } = useHistorial();
  const convertir = useConvertir();
  const recotizar = useRecotizar();
  const sugerir = useSugerirOC();

  // Auth error → bounce to login.
  useEffect(() => {
    const status = (error as unknown as ApiError | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  const all = data ?? [];

  // Filtrado en cliente — el backend no soporta filtros server-side todavía.
  const filtrados = useMemo(() => {
    const q = (filtros.q ?? '').trim().toLowerCase();
    return all.filter((o) => {
      if (filtros.estatus && o.estatus !== filtros.estatus) return false;
      if (filtros.desde || filtros.hasta) {
        if (!inRangeISO(o.fecha, filtros.desde, filtros.hasta)) return false;
      }
      if (q) {
        const hay = `${o.folio} ${o.cliente ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, filtros.estatus, filtros.desde, filtros.hasta, filtros.q]);

  const page = filtros.page ?? 1;
  const pageSize = filtros.page_size ?? 25;
  const total = filtrados.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = useMemo(
    () => filtrados.slice((page - 1) * pageSize, page * pageSize),
    [filtrados, page, pageSize],
  );

  async function onVender(orden: OrdenHistorial) {
    if (!(await confirm({ mensaje: `Convertir ${orden.folio} a VENTA? Esta acción crea la orden de venta y consume el stock.`, tono: 'danger' }))) return;
    try {
      const r = await convertir.mutateAsync(orden.id);
      toast({ kind: 'success', title: `${orden.folio} convertida`, description: `Nuevo folio: ${r.nuevo_folio}` });
    } catch (e) {
      const err = e as ApiError;
      toast({ kind: 'error', title: 'No se pudo convertir', description: err.detail });
    }
  }

  async function onRecotizar(orden: OrdenHistorial) {
    if (!(await confirm({ mensaje: `Crear nueva versión de ${orden.folio}? Te llevará al editor con los datos copiados.`, tono: 'danger' }))) return;
    try {
      const r = await recotizar.mutateAsync(orden.id);
      navigate(`/ventas/cotizador?edit=${r.id}`);
    } catch (e) {
      const err = e as ApiError;
      toast({ kind: 'error', title: 'No se pudo recotizar', description: err.detail });
    }
  }

  async function onSugerirOC(orden: OrdenHistorial) {
    try {
      const r = await sugerir.mutateAsync(orden.id);
      setSugerirOpen({ cotId: orden.id, folio: orden.folio, data: r });
    } catch (e) {
      const err = e as ApiError;
      toast({ kind: 'error', title: 'No se pudo calcular sugerencia', description: err.detail });
    }
  }

  return (
    <div className="space-y-2">
      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-2 grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Folio o cliente…"
            value={filtros.q ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value || undefined, page: 1 }))}
            className="pl-7 h-8 text-xs"
          />
        </div>
        <select
          value={filtros.estatus ?? ''}
          onChange={(e) => setFiltros((f) => ({ ...f, estatus: e.target.value as EstatusOrden | '', page: 1 }))}
          className="h-8 rounded border border-border-strong bg-card px-2 text-xs"
        >
          {ESTATUS_OPCIONES.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={filtros.desde ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value || undefined, page: 1 }))}
            className="pl-7 h-8 text-xs"
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={filtros.hasta ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value || undefined, page: 1 }))}
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-[10px] text-muted-foreground uppercase tracking-[0.15em] sticky top-0 z-10">
            <tr>
              <th className="p-2 text-left">
                <span className="inline-flex items-center gap-1">
                  <Hash className="h-3 w-3 text-muted-foreground" /> Folio
                </span>
              </th>
              <th className="p-2 text-left">
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3 text-muted-foreground" /> Cliente
                </span>
              </th>
              <th className="p-2 text-left">
                <span className="inline-flex items-center gap-1">
                  <CircleDot className="h-3 w-3 text-muted-foreground" /> Estatus
                </span>
              </th>
              <th className="p-2 text-right w-28">
                <span className="inline-flex items-center gap-1 justify-end">
                  <Coins className="h-3 w-3 text-muted-foreground" /> Total
                </span>
              </th>
              <th className="p-2 text-center w-24">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 text-muted-foreground" /> F. creación
                </span>
              </th>
              <th className="p-2 text-center w-12">
                <span className="inline-flex items-center gap-1">
                  <GitBranch className="h-3 w-3 text-muted-foreground" /> v.
                </span>
              </th>
              <th className="p-2 text-right w-56">
                <span className="inline-flex items-center gap-1 justify-end">
                  <Zap className="h-3 w-3 text-muted-foreground" /> Acciones
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="p-4 text-center text-[11px] text-muted-foreground">Cargando historial…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-[11px] text-muted-foreground">Sin cotizaciones que coincidan</td></tr>
            )}
            {items.map((o) => (
              <tr key={o.id} className="border-b border-border hover:bg-surface-2/60">
                <td className="p-2 font-mono text-[11px] font-bold text-accent-glow">{o.folio}</td>
                <td className="p-2 text-foreground max-w-xs truncate">{o.cliente ?? '—'}</td>
                <td className="p-2"><span className={badgeEstatus(o.estatus)}>{o.estatus.toUpperCase()}</span></td>
                <td className="p-2 text-right font-mono font-bold">{fmtMoney(o.total, o.moneda)}</td>
                <td className="p-2 text-center text-[11px] text-muted-foreground">{fmtDate(o.fecha)}</td>
                <td className="p-2 text-center">
                  {o.version > 1 && (
                    <span className="text-[10px] bg-amber-900/30 text-amber-300 px-1.5 py-0.5 rounded">v{o.version}</span>
                  )}
                </td>
                <td className="p-2">
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <a
                      href={`/api/ventas/${o.id}/pdf`} target="_blank" rel="noreferrer"
                      className="text-[11px] px-1.5 py-0.5 rounded border border-border-strong hover:border-accent-glow text-foreground flex items-center gap-1"
                      title="Ver PDF"
                    ><FileText className="h-3 w-3" /> PDF</a>
                    <a
                      href={`/api/ventas/${o.id}/word`} target="_blank" rel="noreferrer"
                      className="text-[11px] px-1.5 py-0.5 rounded border border-border-strong hover:border-accent-glow text-foreground flex items-center gap-1"
                      title="Descargar Word"
                    ><FileText className="h-3 w-3" /> Word</a>
                    {o.estatus === 'cotizacion' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => onVender(o)} disabled={convertir.isPending}>
                          <ShoppingBag className="h-3 w-3 mr-1" /> Vender
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onRecotizar(o)} disabled={recotizar.isPending}>
                          <RefreshCw className="h-3 w-3 mr-1" /> Recotizar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onSugerirOC(o)} disabled={sugerir.isPending}>
                          <Settings className="h-3 w-3 mr-1" /> Sugerir OC
                        </Button>
                      </>
                    )}
                    {(o.estatus === 'pendiente' || o.estatus === 'pagada') && (
                      // El backend valida que la cot tenga al menos 1 línea de
                      // servicio; si no, devuelve 400 y mostramos el detail.
                      // Mantenemos el botón siempre visible en estatus venta
                      // para no requerir un campo extra del backend.
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Generar reporte de servicio (acta)"
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent('cot:open-generar-reporte-servicio', {
                              detail: { orden_venta_id: o.id, folio_cot: o.folio },
                            }),
                          )
                        }
                      >
                        <ClipboardCheck className="h-3 w-3 mr-1" /> Reporte
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Paginación */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <div>Página {page} de {totalPages} · {total} cotizaciones</div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={page === 1}
              onClick={() => setFiltros((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>← Anterior</Button>
            <Button size="sm" variant="ghost" disabled={page >= totalPages}
              onClick={() => setFiltros((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>Siguiente →</Button>
          </div>
        </div>
      )}

      {sugerirOpen && (
        <SugerirOCModal
          cotizacionId={sugerirOpen.cotId}
          folio={sugerirOpen.folio}
          data={sugerirOpen.data}
          onClose={() => setSugerirOpen(null)}
        />
      )}
    </div>
  );
}
