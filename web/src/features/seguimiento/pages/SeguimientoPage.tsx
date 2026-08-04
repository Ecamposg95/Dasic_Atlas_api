import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  FileText,
  Pencil,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  BellPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StatusTone } from '@/lib/status-tones';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { api, type ApiError } from '@/lib/api';
import { RecordatorioFormModal } from '@/features/recordatorios/components/RecordatorioFormModal';
import { useHistorial } from '../hooks/useHistorial';
import type {
  HistorialItem,
  EstatusFilter,
  VencimientoFilter,
  RecotizarResult,
  ConvertirResult,
} from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatTotal(item: HistorialItem): string {
  const num = typeof item.total === 'string' ? parseFloat(item.total) : item.total;
  return `${item.moneda} $${num.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function estatusBadge(estatus: string): { label: string; tone: StatusTone } {
  switch (estatus.toUpperCase()) {
    case 'COTIZACION':
      return { label: 'Cotización', tone: 'info' };
    case 'PENDIENTE':
      return { label: 'Pendiente de pago', tone: 'warning' };
    case 'PAGADA':
      return { label: 'Pagada', tone: 'success' };
    case 'CANCELADA':
      return { label: 'Cancelada', tone: 'danger' };
    default:
      return { label: estatus, tone: 'neutral' };
  }
}

const ESTATUS_OPTIONS: { value: EstatusFilter; label: string }[] = [
  { value: 'TODOS', label: 'Todos los estatus' },
  { value: 'COTIZACION', label: 'Cotización' },
  { value: 'PENDIENTE', label: 'Pendiente de pago' },
  { value: 'PAGADA', label: 'Pagada' },
  { value: 'CANCELADA', label: 'Cancelada' },
];
const VENCIMIENTO_OPTIONS: { value: VencimientoFilter; label: string }[] = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'vigente', label: 'Vigente' },
  { value: 'vencida', label: 'Vencida' },
  { value: 'sin_fecha', label: 'Sin fecha' },
];

// ─── RowActions ────────────────────────────────────────────────────────────────

interface RowActionsProps {
  item: HistorialItem;
  onRecotizar: (id: number) => void;
  onConvertir: (item: HistorialItem) => void;
  onCancelar: (item: HistorialItem) => void;
  onEditar: (id: number) => void;
  onRecordar: (item: HistorialItem) => void;
  loadingId: number | null;
}

function RowActions({ item, onRecotizar, onConvertir, onCancelar, onEditar, onRecordar, loadingId }: RowActionsProps) {
  const estatus = item.estatus.toUpperCase();
  const isBusy = loadingId === item.id;

  const canEdit = estatus === 'COTIZACION';
  const canRecotizar = estatus === 'COTIZACION' || estatus === 'CANCELADA';
  const canConvertir = estatus === 'COTIZACION';
  const canCancelar = estatus === 'COTIZACION' || estatus === 'PENDIENTE';
  const canRecordar = estatus === 'COTIZACION';

  return (
    <div className="flex items-center gap-1">
      {/* Ver PDF */}
      <Button
        variant="ghost"
        size="icon"
        title="Ver PDF"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => window.open(`/api/ventas/${item.id}/pdf`, '_blank', 'noreferrer')}
      >
        <FileText className="h-3.5 w-3.5" />
      </Button>

      {/* Editar */}
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          title="Editar cotización"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => onEditar(item.id)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Recotizar */}
      {canRecotizar && (
        <Button
          variant="ghost"
          size="icon"
          title="Recotizar (nueva versión)"
          className="h-7 w-7 text-muted-foreground hover:text-cyan-600 dark:hover:text-cyan-300"
          disabled={isBusy}
          onClick={() => onRecotizar(item.id)}
        >
          {isBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      )}

      {/* Convertir a venta */}
      {canConvertir && (
        <Button
          variant="ghost"
          size="icon"
          title="Convertir a venta"
          className="h-7 w-7 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-300"
          disabled={isBusy}
          onClick={() => onConvertir(item)}
        >
          <CheckCircle className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Cancelar */}
      {canCancelar && (
        <Button
          variant="ghost"
          size="icon"
          title="Cancelar cotización"
          className="h-7 w-7 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
          disabled={isBusy}
          onClick={() => onCancelar(item)}
        >
          <XCircle className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* Recordar seguimiento */}
      {canRecordar && (
        <Button
          variant="ghost"
          size="icon"
          title="Recordar seguimiento"
          className="h-7 w-7 text-muted-foreground hover:text-cyan-600 dark:hover:text-cyan-300"
          onClick={() => onRecordar(item)}
        >
          <BellPlus className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

// Debounce helper
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── SeguimientoPage ───────────────────────────────────────────────────────────

export function SeguimientoPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Recordatorio modal
  const [recordarOrden, setRecordarOrden] = useState<{ id: number; folio: string } | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [estatusFilter, setEstatusFilter] = useState<EstatusFilter>('TODOS');
  const [vencimientoFilter, setVencimientoFilter] = useState<VencimientoFilter>('TODAS');
  const [page, setPage] = useState(1);

  const searchDebounced = useDebounced(search);

  // Reset page when server-side filters change
  const prevFilters = useRef({ q: searchDebounced, estatus: estatusFilter });
  useEffect(() => {
    const prev = prevFilters.current;
    if (prev.q !== searchDebounced || prev.estatus !== estatusFilter) {
      setPage(1);
      prevFilters.current = { q: searchDebounced, estatus: estatusFilter };
    }
  }, [searchDebounced, estatusFilter]);

  // vencimientoFilter es client-side → resetear a página 1 al cambiarlo.
  useEffect(() => { setPage(1); }, [vencimientoFilter]);

  const { data: historial, isLoading, isPlaceholderData, error } = useHistorial(page, searchDebounced, estatusFilter);

  // Mutations
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const recotizarMutation = useMutation<RecotizarResult, ApiError, number>({
    mutationFn: (id) => api.post<RecotizarResult>(`/api/ventas/${id}/recotizar`),
    onSuccess: (data) => {
      toast({ kind: 'success', title: `Nueva versión creada: ${data.folio}` });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      navigate(`/ventas/cotizador?edit=${data.id}`);
    },
    onError: (err) => {
      toast({ kind: 'error', title: 'Error al recotizar', description: err.detail });
    },
    onSettled: () => setLoadingId(null),
  });

  const convertirMutation = useMutation<ConvertirResult, ApiError, number>({
    mutationFn: (id) => api.post<ConvertirResult>(`/api/ventas/${id}/convertir`),
    onSuccess: (data) => {
      toast({ kind: 'success', title: `Convertida a venta: ${data.folio_venta}` });
      qc.invalidateQueries({ queryKey: ['ventas'] });
    },
    onError: (err) => {
      toast({ kind: 'error', title: 'Error al convertir', description: err.detail });
    },
    onSettled: () => setLoadingId(null),
  });

  const cancelarMutation = useMutation<void, ApiError, number>({
    mutationFn: (id) => api.post<void>(`/api/ventas/${id}/cancelar`),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Cotización cancelada' });
      qc.invalidateQueries({ queryKey: ['ventas'] });
    },
    onError: (err) => {
      toast({ kind: 'error', title: 'Error al cancelar', description: err.detail });
    },
    onSettled: () => setLoadingId(null),
  });

  // Auth redirect
  useEffect(() => {
    const status = (error as ApiError | null)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  // Handlers
  function handleRecotizar(id: number) {
    setLoadingId(id);
    recotizarMutation.mutate(id);
  }

  async function handleConvertir(item: HistorialItem) {
    if (
      !(await confirm({
        mensaje: `¿Convertir ${item.folio} a venta? Esta acción no se puede deshacer.`,
        tono: 'danger',
      }))
    )
      return;
    setLoadingId(item.id);
    convertirMutation.mutate(item.id);
  }

  async function handleCancelar(item: HistorialItem) {
    if (!(await confirm({ mensaje: `¿Cancelar la cotización ${item.folio}?`, tono: 'danger' }))) return;
    setLoadingId(item.id);
    cancelarMutation.mutate(item.id);
  }

  function handleRecordar(item: HistorialItem) {
    setRecordarOrden({ id: item.id, folio: item.folio });
  }

  // Client-side filtering — solo vencimiento (search y estatus van al servidor)
  const filtered = useMemo(() => {
    if (!historial) return [];
    return historial.filter((item) => {
      // Vencimiento — client-side (backend no lo soporta aún)
      if (vencimientoFilter === 'vigente' && (item.esta_vencida || item.fecha_vencimiento === null)) {
        return false;
      }
      if (vencimientoFilter === 'vencida' && !item.esta_vencida) {
        return false;
      }
      if (vencimientoFilter === 'sin_fecha' && item.fecha_vencimiento !== null) {
        return false;
      }

      return true;
    });
  }, [historial, vencimientoFilter]);

  // Error banner (non-401)
  const apiError = error as ApiError | null;
  const showError = !!error && apiError?.status !== 401;

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-4">
        {/* Header */}
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <ListChecks className="h-6 w-6 text-accent-glow" /> Seguimiento de cotizaciones
            </span>
          }
        />

        {/* Error banner */}
        {showError && (
          <div className="text-sm bg-rose-100/60 border border-rose-300 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700/50 dark:text-rose-300 rounded-lg p-3">
            {apiError?.detail ?? 'Error al cargar el historial.'}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            placeholder="Buscar folio o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />

          <select
            value={estatusFilter}
            onChange={(e) => setEstatusFilter(e.target.value as EstatusFilter)}
            className="text-sm rounded-md border border-border-strong bg-card text-foreground px-3 py-2 focus:border-accent-glow outline-none"
          >
            {ESTATUS_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={vencimientoFilter}
            onChange={(e) => setVencimientoFilter(e.target.value as VencimientoFilter)}
            className="text-sm rounded-md border border-border-strong bg-card text-foreground px-3 py-2 focus:border-accent-glow outline-none"
          >
            {VENCIMIENTO_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {historial && (
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} registro(s){page > 1 ? ` — p. ${page}` : ''}
            </span>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-lg p-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando historial…
          </div>
        )}

        {/* Tabla */}
        {!isLoading && !showError && (
          <DataTable>
            <DataTableHead>
              <tr>
                <th className="px-4 py-3 text-left">Folio</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Vencimiento</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Estatus</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {filtered.length === 0 ? (
                <DataTableEmpty colSpan={7}>
                  {historial && historial.length > 0
                    ? 'Sin resultados para los filtros seleccionados.'
                    : 'No hay cotizaciones registradas.'}
                </DataTableEmpty>
              ) : (
                filtered.map((item) => {
                  const { label: estatusLabel, tone: estatusTone } = estatusBadge(
                    item.estatus,
                  );
                  return (
                    <DataTableRow key={item.id}>
                      {/* Folio + badge versión */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-foreground">{item.folio}</span>
                        {item.version > 1 && (
                          <Badge variant="amber" className="ml-1.5">
                            v{item.version}
                          </Badge>
                        )}
                      </td>

                      {/* Cliente */}
                      <td className="px-4 py-3 text-sm text-foreground max-w-[180px] truncate" title={item.cliente}>
                        {item.cliente}
                      </td>

                      {/* Fecha */}
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(item.fecha)}
                      </td>

                      {/* Vencimiento */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.fecha_vencimiento == null ? (
                          <span className="text-xs text-muted-foreground/70">—</span>
                        ) : item.esta_vencida ? (
                          <StatusBadge tone="danger" label="Vencida" />
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <StatusBadge tone="success" label="Vigente" />
                            {item.dias_restantes !== null && (
                              <span className="text-[10px] text-muted-foreground">
                                {item.dias_restantes}d
                              </span>
                            )}
                          </span>
                        )}
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3 text-right text-sm font-mono text-foreground whitespace-nowrap">
                        {formatTotal(item)}
                      </td>

                      {/* Estatus */}
                      <td className="px-4 py-3">
                        <StatusBadge tone={estatusTone} label={estatusLabel} />
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <RowActions
                          item={item}
                          onRecotizar={handleRecotizar}
                          onConvertir={handleConvertir}
                          onCancelar={handleCancelar}
                          onEditar={(id) => navigate(`/ventas/cotizador?edit=${id}`)}
                          onRecordar={handleRecordar}
                          loadingId={loadingId}
                        />
                      </td>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
        )}

        {/* Paginación */}
        {(page > 1 || (historial && historial.length === PAGE_SIZE)) && (
          <div className={`flex items-center justify-between text-sm text-muted-foreground ${isPlaceholderData ? 'opacity-50' : ''}`}>
            <Button variant="outline" size="sm" disabled={page <= 1 || isPlaceholderData} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <span>Página {page}{historial && historial.length === PAGE_SIZE ? ' — hay más registros' : ''}</span>
            <Button variant="outline" size="sm" disabled={!historial || historial.length < PAGE_SIZE || isPlaceholderData} onClick={() => setPage((p) => p + 1)}>
              Siguiente <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>

      {/* Recordatorio modal */}
      {recordarOrden && (
        <RecordatorioFormModal
          ordenId={recordarOrden.id}
          folio={recordarOrden.folio}
          onClose={() => setRecordarOrden(null)}
        />
      )}
    </div>
  );
}
