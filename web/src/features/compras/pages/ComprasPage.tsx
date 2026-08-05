import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Eye, Printer, Package, DollarSign, ShoppingCart,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryError } from '@/components/ui/query-error';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { useIsAdminOrGerente } from '@/lib/permissions';
import { useOrdenesCompra } from '../hooks/useOrdenesCompra';
import { OrdenCompraDetalleModal } from '../components/OrdenCompraDetalleModal';
import { RegistrarRecepcionModal } from '../components/RegistrarRecepcionModal';
import { RegistrarPagoModal } from '../components/RegistrarPagoModal';
import { ProveedoresModal } from '../components/ProveedoresModal';
import { OrdenCompraFormModal } from '../components/OrdenCompraFormModal';
import type { EstatusOC, OrdenCompraListItem } from '../types';

const ESTATUS_OPTS: { value: EstatusOC | ''; label: string }[] = [
  { value: '', label: 'Todos los estatus' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'recibido', label: 'Recibida' },
  { value: 'recibida_parcial', label: 'Recibida parcial' },
  { value: 'pagado', label: 'Pagada' },
  { value: 'cancelada', label: 'Cancelada' },
];

function badgeEstatus(e: EstatusOC) {
  return <StatusBadge status={e} />;
}

function fmtMoney(n: number, m: string) {
  return `${m === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

/** OC se puede recibir si no está ya recibida, pagada o cancelada */
function puedeRecibir(e: EstatusOC) {
  return !['recibido', 'pagado', 'cancelada'].includes(e);
}

/** OC tiene saldo pendiente si no está pagada ni cancelada */
function tieneSaldoPendiente(e: EstatusOC) {
  return !['pagado', 'cancelada'].includes(e);
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

export function ComprasPage() {
  const navigate = useNavigate();
  const puedeCrearOC = useIsAdminOrGerente();

  const [filtroQ, setFiltroQ] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState<EstatusOC | ''>('');
  const [page, setPage] = useState(1);
  const [modalDetalle, setModalDetalle] = useState<number | null>(null);
  const [modalRecepcion, setModalRecepcion] = useState<OrdenCompraListItem | null>(null);
  const [modalPago, setModalPago] = useState<OrdenCompraListItem | null>(null);
  const [modalProveedores, setModalProveedores] = useState(false);
  const [modalCrearOC, setModalCrearOC] = useState(false);

  const filtroQDebounced = useDebounced(filtroQ);

  // Reset page when filters change
  const prevFilters = useRef({ q: filtroQDebounced, estatus: filtroEstatus });
  useEffect(() => {
    const prev = prevFilters.current;
    if (prev.q !== filtroQDebounced || prev.estatus !== filtroEstatus) {
      setPage(1);
      prevFilters.current = { q: filtroQDebounced, estatus: filtroEstatus };
    }
  }, [filtroQDebounced, filtroEstatus]);

  const { data: ordenes, isLoading, isPlaceholderData, isError, error, refetch } = useOrdenesCompra(page, filtroQDebounced, filtroEstatus);

  // 401 → login
  useEffect(() => {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  const filtradas = ordenes ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-accent-glow" /> Compras
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalProveedores(true)}
            >
              Ver proveedores
            </Button>
            {puedeCrearOC && (
              <Button
                size="sm"
                onClick={() => setModalCrearOC(true)}
              >
                + Nueva OC manual
              </Button>
            )}
          </>
        }
      />

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <Input
          value={filtroQ}
          onChange={(e) => setFiltroQ(e.target.value)}
          placeholder="Buscar folio o proveedor…"
          className="flex-1 w-full sm:w-auto sm:min-w-[200px]"
        />
        <select
          value={filtroEstatus}
          onChange={(e) => setFiltroEstatus(e.target.value as EstatusOC | '')}
          className="h-10 rounded-md border border-border-strong bg-card px-2 text-sm"
        >
          {ESTATUS_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setFiltroQ(''); setFiltroEstatus(''); }}
        >
          Limpiar
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtradas.length} orden(es)</span>
      </div>

      {/* Tabla */}
      <DataTable maxBodyHeight="calc(100vh - 22rem)">
        <DataTableHead sticky>
          <tr>
            <th className="px-3 py-2 text-left">Folio</th>
            <th className="px-3 py-2 text-left">Proveedor</th>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-center">Estatus</th>
            <th className="px-3 py-2 text-left">Cotización</th>
            <th className="px-3 py-2 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={7}>Cargando órdenes de compra…</DataTableEmpty>
          )}
          {!isLoading && isError && (
            <QueryError error={error} onRetry={() => void refetch()} asRow colSpan={7} />
          )}
          {!isLoading && !isError && filtradas.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState icon={ShoppingCart} title="Sin órdenes que coincidan" />
              </td>
            </tr>
          )}
          {filtradas.map((o) => (
            <DataTableRow key={o.id}>
              <td className="px-3 py-2 font-mono text-xs text-accent-deep dark:text-accent-glow">
                {o.folio ?? `#${o.id}`}
              </td>
              <td className="px-3 py-2 text-sm">{o.proveedor}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(o.fecha)}</td>
              <td className="px-3 py-2 text-right font-mono text-sm">
                {fmtMoney(o.total, o.moneda)}{' '}
                <span className="text-xs text-muted-foreground">{o.moneda}</span>
              </td>
              <td className="px-3 py-2 text-center">{badgeEstatus(o.estatus)}</td>
              <td className="px-3 py-2 text-xs">
                {o.cotizacion_id ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/spa/cotizador?edit=${o.cotizacion_id}`)}
                    className="text-accent-deep hover:underline dark:text-accent-glow"
                  >
                    #{o.cotizacion_id}
                  </button>
                ) : (
                  <span className="text-muted-foreground/70">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {/* Ver detalle */}
                <button
                  onClick={() => setModalDetalle(o.id)}
                  title="Ver detalle"
                  className="text-accent-deep hover:text-accent-deep/80 dark:text-accent-glow dark:hover:text-accent-glow/80 px-1"
                >
                  <Eye className="h-4 w-4 inline" />
                </button>

                {/* Imprimir */}
                <a
                  href={`/api/compras/${o.id}/imprimir`}
                  target="_blank"
                  rel="noreferrer"
                  title="Imprimir"
                  className="text-muted-foreground hover:text-foreground px-1"
                >
                  <Printer className="h-4 w-4 inline" />
                </a>

                {/* Registrar recepción */}
                {puedeRecibir(o.estatus) && (
                  <button
                    onClick={() => setModalRecepcion(o)}
                    title="Registrar recepción"
                    className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 px-1"
                  >
                    <Package className="h-4 w-4 inline" />
                  </button>
                )}

                {/* Registrar pago */}
                {tieneSaldoPendiente(o.estatus) && (
                  <button
                    onClick={() => setModalPago(o)}
                    title="Registrar pago"
                    className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 px-1"
                  >
                    <DollarSign className="h-4 w-4 inline" />
                  </button>
                )}
              </td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {/* Paginación */}
      {(page > 1 || filtradas.length === PAGE_SIZE) && (
        <div className={`flex items-center justify-between text-sm text-muted-foreground ${isPlaceholderData ? 'opacity-50' : ''}`}>
          <Button variant="outline" size="sm" disabled={page <= 1 || isPlaceholderData} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span>Página {page}{filtradas.length === PAGE_SIZE ? ' — hay más registros' : ''}</span>
          <Button variant="outline" size="sm" disabled={filtradas.length < PAGE_SIZE || isPlaceholderData} onClick={() => setPage((p) => p + 1)}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Modales */}
      {modalDetalle != null && (
        <OrdenCompraDetalleModal
          id={modalDetalle}
          onClose={() => setModalDetalle(null)}
        />
      )}

      {modalRecepcion && (
        <RegistrarRecepcionModal
          id={modalRecepcion.id}
          folio={modalRecepcion.folio}
          onClose={() => setModalRecepcion(null)}
        />
      )}

      {modalPago && (
        <RegistrarPagoModal
          orden={modalPago}
          onClose={() => setModalPago(null)}
        />
      )}

      {modalProveedores && (
        <ProveedoresModal onClose={() => setModalProveedores(false)} />
      )}

      {modalCrearOC && (
        <OrdenCompraFormModal onClose={() => setModalCrearOC(false)} />
      )}
    </div>
  );
}
