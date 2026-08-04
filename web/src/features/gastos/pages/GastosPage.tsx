import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@/lib/confirm';
import { Receipt, Pencil, Trash2 } from 'lucide-react';
import {
  useGastos,
  useCategoriasGasto,
  useCrearGasto,
  useEditarGasto,
  useEliminarGasto,
  GASTOS_PAGE_SIZE,
} from '../hooks/useGastos';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
} from '@/components/ui/data-table';
import { GastoFormModal } from '../components/GastoFormModal';
import type { Gasto, GastoCreate } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMonto(monto: number, moneda: string): string {
  return `${moneda} $${monto.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Fila de gasto
// ---------------------------------------------------------------------------

interface RowProps {
  item: Gasto;
  onEdit: (g: Gasto) => void;
  onDelete: (g: Gasto) => void;
  isDeleting: boolean;
}

function GastoRow({ item, onEdit, onDelete, isDeleting }: RowProps) {
  return (
    <DataTableRow>
      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtFecha(item.fecha)}</td>
      <td className="px-4 py-3 text-foreground text-sm">
        {item.descripcion ?? <span className="text-muted-foreground/70 italic">—</span>}
      </td>
      <td className="px-4 py-3">
        <Badge variant="default">{item.categoria}</Badge>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium">
        {fmtMonto(item.monto, item.moneda)}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {item.usuario ?? '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="secondary"
            title="Editar gasto"
            onClick={() => onEdit(item)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            title="Eliminar gasto"
            disabled={isDeleting}
            onClick={() => onDelete(item)}
            className="text-rose-600 border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:border-rose-900 dark:hover:bg-rose-950 dark:hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </DataTableRow>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export function GastosPage() {
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Gasto | null>(null);

  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const [page, setPage] = useState(1);

  const filtros = useMemo(
    () => ({
      q: busquedaDebounced,
      categoria: filtroCategoria,
      fechaDesde,
      fechaHasta,
    }),
    [busquedaDebounced, filtroCategoria, fechaDesde, fechaHasta],
  );

  // Resetear a la primera página cuando cambian filtros/búsqueda
  useEffect(() => {
    setPage(1);
  }, [busquedaDebounced, filtroCategoria, fechaDesde, fechaHasta]);

  const { data, isLoading, isPlaceholderData } = useGastos(page, filtros);
  const gastos = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / GASTOS_PAGE_SIZE));

  const { data: categorias = [] } = useCategoriasGasto();

  const crear = useCrearGasto();
  const editar = useEditarGasto();
  const eliminar = useEliminarGasto();

  // La lista ya viene filtrada y paginada del servidor
  const filtered = gastos;

  // Gran total del conjunto FILTRADO completo (server-side, no solo la página)
  const totalMXN = data?.totales?.MXN ?? 0;
  const totalUSD = data?.totales?.USD ?? 0;

  function handleSave(data: GastoCreate) {
    if (modalMode === 'create') {
      crear.mutate(data, {
        onSuccess: () => {
          toast({ kind: 'success', title: 'Gasto registrado' });
          setModalMode(null);
        },
        onError: (err) => {
          const detail = (err as { detail?: string }).detail ?? 'Error al registrar el gasto';
          toast({ kind: 'error', title: detail });
        },
      });
    } else if (modalMode === 'edit' && editTarget) {
      editar.mutate(
        { id: editTarget.id, payload: data },
        {
          onSuccess: () => {
            toast({ kind: 'success', title: 'Gasto actualizado' });
            setModalMode(null);
            setEditTarget(null);
          },
          onError: (err) => {
            const detail = (err as { detail?: string }).detail ?? 'Error al actualizar el gasto';
            toast({ kind: 'error', title: detail });
          },
        },
      );
    }
  }

  async function handleDelete(gasto: Gasto) {
    if (!(await confirm({ mensaje: `¿Eliminar el gasto "${gasto.descripcion ?? gasto.categoria}"? Esta acción no se puede deshacer.`, tono: 'danger' }))) return;
    eliminar.mutate(gasto.id, {
      onSuccess: () => toast({ kind: 'success', title: 'Gasto eliminado' }),
      onError: (err) => {
        const status = (err as { status?: number }).status;
        if (status === 403) {
          toast({ kind: 'error', title: 'No tienes permiso para eliminar gastos' });
        } else {
          const detail = (err as { detail?: string }).detail ?? 'Error al eliminar el gasto';
          toast({ kind: 'error', title: detail });
        }
      },
    });
  }

  function openEdit(g: Gasto) {
    setEditTarget(g);
    setModalMode('edit');
  }

  function closeModal() {
    setModalMode(null);
    setEditTarget(null);
  }

  const busy = crear.isPending || editar.isPending;

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-4">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Receipt className="h-6 w-6 text-accent-glow" />
            Gastos
          </span>
        }
        description={!isLoading ? `(${total} ${total === 1 ? 'gasto' : 'gastos'})` : undefined}
        actions={
          <Button size="sm" onClick={() => setModalMode('create')}>
            + Nuevo gasto
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Buscar concepto o categoría…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <Select
          className="max-w-[180px]"
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Desde</span>
          <Input
            type="date"
            className="max-w-[150px]"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Hasta</span>
          <Input
            type="date"
            className="max-w-[150px]"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>
      </div>

      {/* Tabla */}
      <DataTable maxBodyHeight="calc(100vh - 22rem)">
        <DataTableHead sticky>
          <tr>
            <th className="px-4 py-3 text-left">Fecha</th>
            <th className="px-4 py-3 text-left">Concepto</th>
            <th className="px-4 py-3 text-left">Categoría</th>
            <th className="px-4 py-3 text-right">Monto</th>
            <th className="px-4 py-3 text-left">Registrado por</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            <SkeletonRows rows={6} cols={6} />
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyState
                  icon={Receipt}
                  title={total === 0 && !busquedaDebounced && !filtroCategoria && !fechaDesde && !fechaHasta ? 'No hay gastos registrados' : 'Sin resultados para estos filtros'}
                />
              </td>
            </tr>
          ) : (
            filtered.map((item) => (
              <GastoRow
                key={item.id}
                item={item}
                onEdit={openEdit}
                onDelete={handleDelete}
                isDeleting={eliminar.isPending && eliminar.variables === item.id}
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

      {/* Gran total del conjunto filtrado completo (server-side, no solo la página) */}
      {(totalMXN > 0 || totalUSD > 0) && (
        <footer className="flex justify-end gap-6 text-sm border-t border-border pt-4">
          {totalMXN > 0 && (
            <div className="text-right">
              <span className="text-muted-foreground text-xs block">Total filtrado MXN</span>
              <span className="font-semibold text-foreground">
                MXN ${totalMXN.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
          {totalUSD > 0 && (
            <div className="text-right">
              <span className="text-muted-foreground text-xs block">Total filtrado USD</span>
              <span className="font-semibold text-foreground">
                USD ${totalUSD.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </footer>
      )}

      {/* Modal create/edit */}
      {modalMode && (
        <GastoFormModal
          mode={modalMode}
          gasto={modalMode === 'edit' ? editTarget ?? undefined : undefined}
          categorias={categorias}
          onSave={handleSave}
          onClose={closeModal}
          busy={busy}
        />
      )}
    </div>
  );
}
