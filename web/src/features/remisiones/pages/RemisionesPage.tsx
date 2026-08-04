import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Truck, Eye, CheckSquare, X, Plus, FileText, FileDown } from 'lucide-react';
import { useRemisiones, useRemisionDetalle, useRegistrarRecepcion } from '../hooks/useRemisiones';
import { toast } from '@/lib/toast';
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

type RecibidaFiltro = 'todas' | 'recibida' | 'pendiente';

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
// Modal: Detalle de remisión
// ---------------------------------------------------------------------------

interface DetalleModalProps {
  remisionId: number;
  onClose: () => void;
}

function DetalleModal({ remisionId, onClose }: DetalleModalProps) {
  const { data, isLoading } = useRemisionDetalle(remisionId);

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
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cerrar
        </Button>
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
}

function RemisionRow({ item, onVerDetalle, onRecepcion }: RowProps) {
  const recibida = item.recibido_at !== null;

  return (
    <DataTableRow>
      <td className="px-4 py-3 font-mono text-xs text-accent-glow">{item.folio}</td>
      <td className="px-4 py-3">
        {item.orden_folio ? (
          <Link
            to={`/ventas/cotizador?edit=${item.orden_venta_id}`}
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
        <StatusBadge
          tone={recibida ? 'success' : 'warning'}
          label={recibida ? 'RECIBIDA' : 'PENDIENTE'}
        />
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
          {!recibida && (
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
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [recibidaFiltro, setRecibidaFiltro] = useState<RecibidaFiltro>('todas');
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [recepcionTarget, setRecepcionTarget] = useState<{ id: number; folio: string | null } | null>(null);

  const searchDebounced = useDebounced(search);
  // v2: el GET / ya no acepta `recibida` (boolean) — filtra por `estado`.
  // Mapeo mínimo que preserva el toggle existente: "pendiente" ahora
  // significa "emitida" (emitida y aún no recibida); el rediseño completo
  // del filtro (incluyendo borrador/cancelada) es de Task 10/11.
  const estadoParam: RemisionEstado | undefined =
    recibidaFiltro === 'recibida' ? 'recibida' : recibidaFiltro === 'pendiente' ? 'emitida' : undefined;

  // Reset page when filters change
  const prevFilters = useRef({ q: searchDebounced, recibida: recibidaFiltro });
  useEffect(() => {
    if (prevFilters.current.q !== searchDebounced || prevFilters.current.recibida !== recibidaFiltro) {
      setPage(1);
      prevFilters.current = { q: searchDebounced, recibida: recibidaFiltro };
    }
  }, [searchDebounced, recibidaFiltro]);

  const { data, isLoading, isPlaceholderData } = useRemisiones(page, searchDebounced, {
    estado: estadoParam,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
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
          <Button size="sm" onClick={() => navigate('/spa/remisiones-nueva')}>
            <Plus className="h-4 w-4 mr-1" />
            Nueva remisión
          </Button>
        }
      />

      {/* Toolbar: búsqueda + filtro de recepción */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por folio o cliente…"
        filters={
          <select
            value={recibidaFiltro}
            onChange={(e) => setRecibidaFiltro(e.target.value as RecibidaFiltro)}
            className="text-sm rounded-md border border-border bg-surface-2 px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent-glow"
          >
            <option value="todas">Todas</option>
            <option value="recibida">Recibida</option>
            <option value="pendiente">Pendiente</option>
          </select>
        }
      />

      {/* Tabla */}
      <DataTable>
        <DataTableHead>
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
                {searchDebounced || recibidaFiltro !== 'todas' ? (
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
        <DetalleModal remisionId={detalleId} onClose={() => setDetalleId(null)} />
      )}

      {/* Modal recepción */}
      {recepcionTarget && (
        <RecepcionModal
          remisionId={recepcionTarget.id}
          folio={recepcionTarget.folio}
          onClose={() => setRecepcionTarget(null)}
        />
      )}
    </div>
  );
}
