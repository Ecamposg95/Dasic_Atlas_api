import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Truck, Eye, CheckSquare, X, Plus, FileText, FileDown, Pencil, Trash2, Ban, Repeat } from 'lucide-react';
import {
  useRemisiones,
  useRemisionDetalle,
  useRegistrarRecepcion,
  useEliminarBorrador,
  useCrearCotizacionDesde,
} from '../hooks/useRemisiones';
import { useUsuarios } from '@/features/usuarios/hooks/useUsuarios';
import { useIsAdminOrGerente } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { ListToolbar } from '@/components/ui/list-toolbar';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
} from '@/components/ui/data-table';
import type { RemisionItem, RemisionEstado } from '../types';
import { remisionEstadoLabel, remisionEstadoTone } from '../lib/estado';
import { CancelarRemisionModal } from '../components/CancelarRemisionModal';

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

type EstadoFiltro = RemisionEstado | 'todas';

const ESTADOS_FILTRO: { value: EstadoFiltro; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'emitida', label: 'Emitida' },
  { value: 'recibida', label: 'Recibida' },
  { value: 'cancelada', label: 'Cancelada' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Modal: Registrar Recepción
// ---------------------------------------------------------------------------

interface RecepcionModalProps {
  remisionId: number;
  folio: string | null;
  onClose: () => void;
}

function RecepcionModal({ remisionId, folio, onClose }: RecepcionModalProps) {
  const [recibidoPor, setRecibidoPor] = useState('');
  const registrar = useRegistrarRecepcion();

  function handleSubmit() {
    if (!recibidoPor.trim()) return;
    registrar.mutate(
      { id: remisionId, recibido_por: recibidoPor.trim() },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: `Recepción registrada para ${folio ?? 'la remisión'}` });
          onClose();
        },
        onError: (err) => {
          const detail = (err as { detail?: string }).detail ?? 'Error al registrar recepción';
          toast({ kind: 'error', title: detail });
        },
      },
    );
  }

  return (
    <Modal title={`Registrar recepción — ${folio ?? 'sin folio'}`} onClose={onClose} size="sm">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Recibido por <span className="text-rose-600 dark:text-rose-400">*</span>
          </label>
          <Input
            value={recibidoPor}
            onChange={(e) => setRecibidoPor(e.target.value)}
            placeholder="Nombre de quien recibe"
            autoFocus
          />
        </div>
      </div>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={registrar.isPending}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={registrar.isPending || !recibidoPor.trim()}
        >
          {registrar.isPending ? 'Guardando…' : 'Confirmar recepción'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Modal: Detalle de remisión — acciones por estado del ciclo (Task 11)
// ---------------------------------------------------------------------------

interface DetalleModalProps {
  remisionId: number;
  onClose: () => void;
  onEditar: (id: number) => void;
  onRecepcion: (id: number, folio: string | null) => void;
  onCancelar: (id: number, folio: string | null) => void;
}

function DetalleModal({ remisionId, onClose, onEditar, onRecepcion, onCancelar }: DetalleModalProps) {
  const { data, isLoading } = useRemisionDetalle(remisionId);
  const eliminar = useEliminarBorrador();
  const crearCotizacion = useCrearCotizacionDesde();
  const navigate = useNavigate();

  async function onEliminar() {
    if (!data) return;
    const ok = await confirm({
      titulo: 'Eliminar borrador',
      mensaje: `¿Eliminar el borrador ${data.folio ?? `#${data.id}`}? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tono: 'danger',
    });
    if (!ok) return;
    eliminar.mutate(remisionId, {
      onSuccess: () => {
        toast({ kind: 'success', title: 'Borrador eliminado' });
        onClose();
      },
      onError: (e) => {
        const detail = (e as { status?: number; detail?: string }).detail ?? 'No se pudo eliminar el borrador';
        if ((e as { status?: number }).status === 401) { window.location.href = '/spa/login'; return; }
        toast({ kind: 'error', title: detail });
      },
    });
  }

  async function onCrearCotizacion() {
    if (!data) return;
    const ok = await confirm({
      titulo: 'Crear cotización desde remisión',
      mensaje: 'Se creará una nueva cotización a partir de las líneas de esta remisión. ¿Continuar?',
      confirmLabel: 'Crear cotización',
    });
    if (!ok) return;
    crearCotizacion.mutate(remisionId, {
      onSuccess: (r) => {
        toast({ kind: 'success', title: `Cotización ${r.folio} creada` });
        onClose();
        navigate(`/spa/cotizador?edit=${r.orden_venta_id}`);
      },
      onError: (e) => {
        const detail = (e as { status?: number; detail?: string }).detail ?? 'No se pudo crear la cotización';
        if ((e as { status?: number }).status === 401) { window.location.href = '/spa/login'; return; }
        toast({ kind: 'error', title: detail });
      },
    });
  }

  return (
    <Modal title={`Detalle remisión${data ? ` — ${data.folio ?? 'sin folio'}` : ''}`} onClose={onClose} size="lg">
      {isLoading || !data ? (
        <div className="space-y-2 py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2">
            <StatusBadge tone={remisionEstadoTone(data.estado)} label={remisionEstadoLabel(data.estado)} />
          </div>

          {data.estado === 'cancelada' && (
            <div className="rounded-md border border-rose-700/50 bg-rose-900/20 p-3 text-xs text-rose-200 space-y-1">
              <div className="font-semibold">Remisión cancelada</div>
              <div>{data.motivo_cancelacion || 'Sin motivo registrado.'}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-foreground">
            <div>
              <span className="text-muted-foreground text-xs">Orden de venta</span>
              <div>{data.orden_folio ?? '—'}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Cliente</span>
              <div>{data.cliente_nombre ?? '—'}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Fecha remisión</span>
              <div>{fmtFecha(data.fecha_remision)}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Transportista</span>
              <div>{data.transportista ?? '—'}</div>
            </div>
            {data.recibido_por && (
              <>
                <div>
                  <span className="text-muted-foreground text-xs">Recibido por</span>
                  <div>{data.recibido_por}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Fecha recepción</span>
                  <div>{fmtFecha(data.recibido_at)}</div>
                </div>
              </>
            )}
            {data.observaciones && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Observaciones</span>
                <div className="text-muted-foreground">{data.observaciones}</div>
              </div>
            )}
          </div>

          {data.detalles.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Líneas ({data.detalles.length})</p>
              <table className="w-full text-xs border border-border rounded">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {data.detalles.map((d) => (
                    <tr key={d.id} className="border-b border-border/60">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{d.sku ?? '—'}</td>
                      <td className="px-3 py-2">{d.descripcion ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <ModalFooter>
        <div className="flex flex-wrap gap-2 w-full">
          <div className="flex flex-wrap gap-2 flex-1">
            {data && data.estado === 'borrador' && (
              <>
                <Button size="sm" variant="outline" onClick={() => onEditar(data.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onEliminar}
                  disabled={eliminar.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
                </Button>
              </>
            )}
            {data && (data.estado === 'emitida' || data.estado === 'recibida') && (
              <>
                {data.estado === 'emitida' && (
                  <Button size="sm" variant="outline" onClick={() => onRecepcion(data.id, data.folio)}>
                    <CheckSquare className="h-3.5 w-3.5 mr-1" />
                    Registrar recepción
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCrearCotizacion}
                  disabled={crearCotizacion.isPending}
                  className="text-cyan-600 border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:text-cyan-400 dark:border-cyan-900 dark:hover:bg-cyan-950 dark:hover:text-cyan-300"
                >
                  <Repeat className="h-3.5 w-3.5 mr-1" />
                  {crearCotizacion.isPending ? 'Creando…' : 'Crear cotización'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCancelar(data.id, data.folio)}
                  className="text-rose-600 border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:border-rose-900 dark:hover:bg-rose-950 dark:hover:text-rose-300"
                >
                  <Ban className="h-3.5 w-3.5 mr-1" />
                  Cancelar
                </Button>
              </>
            )}
            {data && (
              <>
                <Button size="sm" variant="secondary" onClick={() => window.open(`/api/remisiones/${data.id}/imprimir`, '_blank')}>
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  Imprimir
                </Button>
                <Button size="sm" variant="secondary" onClick={() => window.open(`/api/remisiones/${data.id}/word`, '_blank')}>
                  <FileDown className="h-3.5 w-3.5 mr-1" />
                  Word
                </Button>
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5 mr-1" />
            Cerrar
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Fila de remisión
// ---------------------------------------------------------------------------

interface RowProps {
  item: RemisionItem;
  onVerDetalle: (id: number) => void;
  onRecepcion: (id: number, folio: string | null) => void;
  onEditar: (id: number) => void;
}

function RemisionRow({ item, onVerDetalle, onRecepcion, onEditar }: RowProps) {
  return (
    <DataTableRow>
      <td className="px-4 py-3 font-mono text-xs text-accent-glow">{item.folio ?? '—'}</td>
      <td className="px-4 py-3">
        {item.orden_folio ? (
          <Link
            to={`/spa/cotizador?edit=${item.orden_venta_id}`}
            className="text-accent-glow hover:underline text-xs font-mono"
          >
            {item.orden_folio}
          </Link>
        ) : (
          <span className="text-muted-foreground/70 italic text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-foreground text-sm">
        {item.cliente_nombre ?? <span className="text-muted-foreground/70 italic">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtFecha(item.fecha_remision)}</td>
      <td className="px-4 py-3">
        <StatusBadge tone={remisionEstadoTone(item.estado)} label={remisionEstadoLabel(item.estado)} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="secondary"
            title="Ver detalle"
            onClick={() => onVerDetalle(item.id)}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Ver
          </Button>
          {item.estado === 'borrador' && (
            <Button
              size="sm"
              variant="secondary"
              title="Editar borrador"
              onClick={() => onEditar(item.id)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Editar
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            title="Imprimir PDF"
            onClick={() => window.open(`/api/remisiones/${item.id}/imprimir`, '_blank')}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            PDF
          </Button>
          <Button
            size="sm"
            variant="secondary"
            title="Descargar Word"
            onClick={() => window.open(`/api/remisiones/${item.id}/word`, '_blank')}
          >
            <FileDown className="h-3.5 w-3.5 mr-1" />
            Word
          </Button>
          {item.estado === 'emitida' && (
            <Button
              size="sm"
              variant="outline"
              title="Registrar recepción"
              onClick={() => onRecepcion(item.id, item.folio)}
              className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:border-emerald-900 dark:hover:bg-emerald-950 dark:hover:text-emerald-300"
            >
              <CheckSquare className="h-3.5 w-3.5 mr-1" />
              Recibir
            </Button>
          )}
        </div>
      </td>
    </DataTableRow>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function RemisionesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>('todas');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  // `?orden_venta_id=<id>` filtra el listado por orden de venta — usado por el
  // botón "Ver entregas/remisiones" de Seguimiento.
  const [ordenVentaFiltro, setOrdenVentaFiltro] = useState<number | null>(() => {
    const raw = searchParams.get('orden_venta_id');
    const id = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(id) ? null : id;
  });
  const [creadorFiltro, setCreadorFiltro] = useState<number | null>(null);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [recepcionTarget, setRecepcionTarget] = useState<{ id: number; folio: string | null } | null>(null);
  const [cancelarTarget, setCancelarTarget] = useState<{ id: number; folio: string | null } | null>(null);

  // `?ver=<id>` abre el detalle directo — usado por el link de "Remisiones"
  // en la sección "Avance de entrega" del detalle de venta (navegación
  // bidireccional venta ↔ remisión, Task 11).
  useEffect(() => {
    const ver = searchParams.get('ver');
    if (ver) {
      const id = parseInt(ver, 10);
      if (!Number.isNaN(id)) setDetalleId(id);
      const next = new URLSearchParams(searchParams);
      next.delete('ver');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchDebounced = useDebounced(search);

  const isAdminOrGerente = useIsAdminOrGerente();
  // Endpoint admin-only: solo se consulta cuando el rol puede ver el filtro.
  const { data: usuarios } = useUsuarios(isAdminOrGerente);

  // Reset page when filters change
  const prevFilters = useRef({ q: searchDebounced, estado: estadoFiltro, desde, hasta, orden: ordenVentaFiltro, creador: creadorFiltro });
  useEffect(() => {
    const cur = { q: searchDebounced, estado: estadoFiltro, desde, hasta, orden: ordenVentaFiltro, creador: creadorFiltro };
    if (JSON.stringify(prevFilters.current) !== JSON.stringify(cur)) {
      setPage(1);
      prevFilters.current = cur;
    }
  }, [searchDebounced, estadoFiltro, desde, hasta, ordenVentaFiltro, creadorFiltro]);

  const { data, isLoading, isPlaceholderData } = useRemisiones(page, searchDebounced, {
    estado: estadoFiltro === 'todas' ? undefined : estadoFiltro,
    ordenVentaId: ordenVentaFiltro ?? undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    creadoPorId: creadorFiltro ?? undefined,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hayFiltrosActivos =
    !!searchDebounced || estadoFiltro !== 'todas' || !!desde || !!hasta ||
    ordenVentaFiltro !== null || creadorFiltro !== null;

  // Folio de la orden filtrada (si hay resultados que la referencian).
  const ordenFolioFiltro =
    ordenVentaFiltro !== null
      ? items.find((i) => i.orden_venta_id === ordenVentaFiltro)?.orden_folio ?? null
      : null;

  function quitarFiltroOrden() {
    setOrdenVentaFiltro(null);
    const next = new URLSearchParams(searchParams);
    next.delete('orden_venta_id');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-4">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Truck className="h-6 w-6 text-accent-glow" />
            Remisiones
          </span>
        }
        description={!isLoading ? `(${total} ${total === 1 ? 'remisión' : 'remisiones'})` : undefined}
        actions={
          <Button size="sm" onClick={() => navigate('/spa/remisiones')}>
            <Plus className="h-4 w-4 mr-1" />
            Nueva remisión
          </Button>
        }
      />

      {/* Toolbar: búsqueda + filtros de estado y rango de fechas */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por folio o cliente…"
        filters={
          <>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}
              className="text-sm rounded-md border border-border bg-surface-2 px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent-glow"
            >
              {ESTADOS_FILTRO.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Desde</span>
              <Input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="h-9 max-w-[150px] text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Hasta</span>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="h-9 max-w-[150px] text-sm"
              />
            </div>
            {isAdminOrGerente && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Creador</span>
                <select
                  value={creadorFiltro ?? 'todos'}
                  onChange={(e) =>
                    setCreadorFiltro(e.target.value === 'todos' ? null : Number(e.target.value))
                  }
                  className="text-sm rounded-md border border-border bg-surface-2 px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent-glow"
                >
                  <option value="todos">Todos</option>
                  {(usuarios ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            {ordenVentaFiltro !== null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-glow/40 bg-accent-glow/10 px-2.5 py-1 text-xs text-accent-glow">
                Filtrando por orden {ordenFolioFiltro ?? `#${ordenVentaFiltro}`}
                <button
                  type="button"
                  aria-label="Quitar filtro de orden"
                  onClick={quitarFiltroOrden}
                  className="hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </>
        }
      />

      {/* Tabla */}
      <DataTable maxBodyHeight="calc(100vh - 22rem)">
        <DataTableHead sticky>
          <tr>
            <th className="px-4 py-3 text-left">Folio</th>
            <th className="px-4 py-3 text-left">Orden venta</th>
            <th className="px-4 py-3 text-left">Cliente</th>
            <th className="px-4 py-3 text-left">Fecha</th>
            <th className="px-4 py-3 text-left">Estatus</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            <SkeletonRows rows={6} cols={6} />
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={6}>
                {hayFiltrosActivos ? (
                  <EmptyState icon={Truck} title="Sin coincidencias con los filtros" />
                ) : (
                  <EmptyState
                    icon={Truck}
                    title="No hay remisiones registradas"
                    description="Las remisiones se crean desde el detalle de una orden de venta."
                  />
                )}
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <RemisionRow
                key={item.id}
                item={item}
                onVerDetalle={(id) => setDetalleId(id)}
                onRecepcion={(id, folio) => setRecepcionTarget({ id, folio })}
                onEditar={(id) => navigate(`/spa/remisiones/${id}/editar`)}
              />
            ))
          )}
        </DataTableBody>
      </DataTable>

      {/* Paginación */}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={isPlaceholderData}
      />

      {/* Modal detalle */}
      {detalleId !== null && (
        <DetalleModal
          remisionId={detalleId}
          onClose={() => setDetalleId(null)}
          onEditar={(id) => {
            setDetalleId(null);
            navigate(`/spa/remisiones/${id}/editar`);
          }}
          onRecepcion={(id, folio) => {
            setDetalleId(null);
            setRecepcionTarget({ id, folio });
          }}
          onCancelar={(id, folio) => {
            setDetalleId(null);
            setCancelarTarget({ id, folio });
          }}
        />
      )}

      {/* Modal recepción */}
      {recepcionTarget && (
        <RecepcionModal
          remisionId={recepcionTarget.id}
          folio={recepcionTarget.folio}
          onClose={() => setRecepcionTarget(null)}
        />
      )}

      {/* Modal cancelar (motivo obligatorio) */}
      {cancelarTarget && (
        <CancelarRemisionModal
          remisionId={cancelarTarget.id}
          folio={cancelarTarget.folio}
          onClose={() => setCancelarTarget(null)}
        />
      )}
    </div>
  );
}
