import { useEffect, useRef, useState } from 'react';
import { ClipboardCheck, CheckSquare, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { ListToolbar } from '@/components/ui/list-toolbar';
import { Pagination } from '@/components/ui/pagination';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import { toast } from '@/lib/toast';
import {
  useReportesServicioDocs,
  useRegistrarRecepcionReporte,
} from '../hooks/useReportesServicioDocs';
import type { ReporteServicioDocItem } from '../types';
import { GenerarReporteServicioModal } from '../components/GenerarReporteServicioModal';

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

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-surface-2 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Modal: Registrar Recepción
// ---------------------------------------------------------------------------

interface RecepcionModalProps {
  reporteId: number;
  folio: string;
  onClose: () => void;
}

function RecepcionModal({ reporteId, folio, onClose }: RecepcionModalProps) {
  const [nombre, setNombre] = useState('');
  const registrar = useRegistrarRecepcionReporte();

  function handleSubmit() {
    if (!nombre.trim()) return;
    registrar.mutate(
      { id: reporteId, cliente_recibe_nombre: nombre.trim() },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: `Recepción registrada para ${folio}` });
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
    <Modal title={`Registrar recepción — ${folio}`} onClose={onClose} size="sm">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Recibido por <span className="text-rose-600 dark:text-rose-400">*</span>
          </label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de quien recibe en cliente"
            autoFocus
          />
        </div>
      </div>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={registrar.isPending}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={registrar.isPending || !nombre.trim()}>
          {registrar.isPending ? 'Guardando…' : 'Confirmar recepción'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

interface RowProps {
  item: ReporteServicioDocItem;
  onRecepcion: (id: number, folio: string) => void;
}

function ReporteRow({ item, onRecepcion }: RowProps) {
  const recibido = item.recibido_at !== null;

  return (
    <DataTableRow>
      <td className="px-4 py-3 font-mono text-xs text-accent-glow">{item.folio ?? '—'}</td>
      <td className="px-4 py-3">
        {item.orden_venta_folio ? (
          <a
            href={`/ventas/cotizador?edit=${item.orden_venta_id}`}
            className="text-accent-glow hover:underline text-xs font-mono"
          >
            {item.orden_venta_folio}
          </a>
        ) : (
          <span className="text-muted-foreground/70 italic text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-foreground text-sm">
        {item.cliente_nombre ?? <span className="text-muted-foreground/70 italic">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {fmtFecha(item.fecha_reporte)}
      </td>
      <td className="px-4 py-3 text-foreground text-sm">
        {item.tecnico_nombre ?? <span className="text-muted-foreground/70 italic">—</span>}
      </td>
      <td className="px-4 py-3">
        <StatusBadge
          tone={recibido ? 'success' : 'warning'}
          label={recibido ? 'RECIBIDO' : 'PENDIENTE'}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            title="Descargar PDF"
            onClick={() => window.open(`/api/reportes-servicio-docs/${item.id}/pdf`, '_blank', 'noreferrer')}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            PDF
          </Button>
          {!recibido && item.folio && (
            <Button
              size="sm"
              variant="outline"
              title="Registrar recepción"
              onClick={() => onRecepcion(item.id, item.folio!)}
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

export function ReportesServicioDocsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [recepcionTarget, setRecepcionTarget] = useState<{ id: number; folio: string } | null>(null);

  const searchDebounced = useDebounced(search);

  // Reset page when search changes
  const prevQ = useRef(searchDebounced);
  useEffect(() => {
    if (prevQ.current !== searchDebounced) {
      setPage(1);
      prevQ.current = searchDebounced;
    }
  }, [searchDebounced]);

  const { data, isLoading, isPlaceholderData } = useReportesServicioDocs(page, searchDebounced);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <ClipboardCheck className="h-6 w-6 text-accent-glow" />
            Reportes de servicio
          </span>
        }
        description={
          !isLoading && (
            <>
              ({total} {total === 1 ? 'reporte' : 'reportes'})
            </>
          )
        }
        actions={
          <Button
            size="sm"
            disabled
            title="Genera el reporte desde el historial de cotizaciones (tab Historial del Cotizador)"
          >
            + Nuevo reporte
          </Button>
        }
      />

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por folio, cliente o técnico…"
      />

      <DataTable>
        <DataTableHead>
          <tr>
            <th className="px-4 py-3 text-left">Folio</th>
            <th className="px-4 py-3 text-left">Orden venta</th>
            <th className="px-4 py-3 text-left">Cliente</th>
            <th className="px-4 py-3 text-left">Fecha</th>
            <th className="px-4 py-3 text-left">Técnico</th>
            <th className="px-4 py-3 text-left">Estatus</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
          ) : items.length === 0 ? (
            <DataTableEmpty colSpan={7}>
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ClipboardCheck className="h-10 w-10 opacity-30" />
                {searchDebounced ? (
                  <p>Sin coincidencias con la búsqueda</p>
                ) : (
                  <>
                    <p>No hay reportes de servicio registrados</p>
                    <p className="text-xs">
                      Los reportes se generan desde el Historial del Cotizador, en
                      cotizaciones con líneas de servicio.
                    </p>
                  </>
                )}
              </div>
            </DataTableEmpty>
          ) : (
            items.map((item) => (
              <ReporteRow
                key={item.id}
                item={item}
                onRecepcion={(id, folio) => setRecepcionTarget({ id, folio })}
              />
            ))
          )}
        </DataTableBody>
      </DataTable>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={isPlaceholderData}
      />

      {recepcionTarget && (
        <RecepcionModal
          reporteId={recepcionTarget.id}
          folio={recepcionTarget.folio}
          onClose={() => setRecepcionTarget(null)}
        />
      )}

      {/* Modal global escucha window event para generar desde Historial */}
      <GenerarReporteServicioModal />
    </div>
  );
}
