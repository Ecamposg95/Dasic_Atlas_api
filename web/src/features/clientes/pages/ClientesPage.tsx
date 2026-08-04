import { useEffect, useRef, useState } from 'react';
import { confirm } from '@/lib/confirm';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Users, ChevronUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHead,
  DataTableRow,
} from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useIsAdmin } from '@/lib/permissions';
import { useClientes, useClientesCount } from '../hooks/useClientes';
import { useDuplicados } from '../hooks/useDuplicados';
import { ClienteFormModal } from '../components/ClienteFormModal';
import { EmpresaDetalleDrawer } from '../components/EmpresaDetalleDrawer';
import { BulkActionBar } from '../components/BulkActionBar';
import type { Cliente, ClienteCreate, ClienteUpdate, MonedaCredito } from '../types';

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

function fmtMoney(moneda: MonedaCredito, value: number | string) {
  const n = Number(value) || 0;
  const amount = `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  // El prefijo MXN es ruido en el directorio; solo se muestra el código si NO es MXN.
  return moneda && moneda !== 'MXN' ? `${moneda} ${amount}` : amount;
}

function fmtDate(val: string | null | undefined) {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return val;
  }
}

type SortDir = 'asc' | 'desc';

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === 'asc'
    ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
    : <ChevronDown className="inline h-3 w-3 ml-0.5" />;
}

export function ClientesPage() {
  const [filtroQ, setFiltroQ] = useState('');
  const [page, setPage] = useState(1);
  const [estatus, setEstatus] = useState('');
  const [sort, setSort] = useState('');
  const [dir, setDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<number[]>([]);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalEditar, setModalEditar] = useState<Cliente | null>(null);
  const [detalle, setDetalle] = useState<Cliente | null>(null);

  const navigate = useNavigate();
  const { data: dups } = useDuplicados();
  const dupCount = dups?.length ?? 0;

  const filtroQDebounced = useDebounced(filtroQ);

  // Reset page when search or estatus changes
  const prevQ = useRef(filtroQDebounced);
  const prevEstatus = useRef(estatus);
  useEffect(() => {
    if (prevQ.current !== filtroQDebounced || prevEstatus.current !== estatus) {
      setPage(1);
      prevQ.current = filtroQDebounced;
      prevEstatus.current = estatus;
    }
  }, [filtroQDebounced, estatus]);

  const { data: clientes, isLoading, isPlaceholderData, error } = useClientes({
    page,
    q: filtroQDebounced,
    pageSize: PAGE_SIZE,
    estatus,
    sort,
    dir,
  });
  const { data: countData } = useClientesCount(filtroQDebounced, estatus);
  const totalCount = countData?.total ?? 0;

  const qc = useQueryClient();

  // 401 → login
  useEffect(() => {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  const filtrados = clientes ?? [];

  // Sorting helpers
  function toggleSort(col: string) {
    if (sort === col) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setDir('asc');
    }
    setPage(1);
  }

  // Selection helpers
  const currentPageIds = filtrados.map((c) => c.id);
  const allSelected = currentPageIds.length > 0 && currentPageIds.every((id) => selected.includes(id));

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => prev.filter((id) => !currentPageIds.includes(id)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...currentPageIds])]);
    }
  }

  function toggleRow(id: number) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // Estatus badge
  function estatusBadge(est: string | undefined) {
    if (!est) return <span className="text-xs text-muted-foreground">—</span>;
    return <StatusBadge status={est} />;
  }

  // Mutations
  const crearMut = useMutation<Cliente, { status?: number; detail?: string }, ClienteCreate>({
    mutationFn: (body) => api.post<Cliente>('/api/clientes/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast({ kind: 'success', title: 'Cliente creado' });
      setModalCrear(false);
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Solo admin' });
      else toast({ kind: 'error', title: 'No se pudo crear', description: e.detail });
    },
  });

  const editarMut = useMutation<
    Cliente,
    { status?: number; detail?: string },
    { id: number; payload: ClienteUpdate }
  >({
    mutationFn: ({ id, payload }) => api.put<Cliente>(`/api/clientes/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast({ kind: 'success', title: 'Cliente actualizado' });
      setModalEditar(null);
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Solo admin' });
      else toast({ kind: 'error', title: 'No se pudo actualizar', description: e.detail });
    },
  });

  const eliminarMut = useMutation<void, { status?: number; detail?: string }, number>({
    mutationFn: (id) => api.delete<void>(`/api/clientes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast({ kind: 'success', title: 'Cliente eliminado' });
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Solo admin', description: 'Solo admin/asistente puede eliminar.' });
      else toast({ kind: 'error', title: 'No se pudo eliminar', description: e.detail });
    },
  });

  async function onEliminar(c: Cliente) {
    if (await confirm({ mensaje: `¿Eliminar al cliente "${c.nombre_empresa}"? Esta acción no se puede deshacer.`, tono: 'danger' })) {
      eliminarMut.mutate(c.id);
    }
  }

  const isAdmin = useIsAdmin();

  // Pagination
  const totalForPagination = totalCount || (filtrados.length === PAGE_SIZE ? page * PAGE_SIZE + 1 : (page - 1) * PAGE_SIZE + filtrados.length);
  const showPagination = page > 1 || filtrados.length === PAGE_SIZE || totalCount > PAGE_SIZE;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Users className="h-5 w-5 text-accent-glow" /> Empresas
          </span>
        }
        description={
          <>
            {totalCount > 0 ? `${totalCount} empresa(s)` : `${filtrados.length} empresa(s)`}
            {page > 1 ? ` — p. ${page}` : ''}
          </>
        }
        actions={
          <>
            {isAdmin && dupCount > 0 && (
              <Button size="sm" variant="outline" onClick={() => navigate('/spa/empresas-unificar')}>
                Unificar duplicados ({dupCount})
              </Button>
            )}
            <Button size="sm" onClick={() => setModalCrear(true)}>
              + Nueva empresa
            </Button>
          </>
        }
      />

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <Input
          value={filtroQ}
          onChange={(e) => setFiltroQ(e.target.value)}
          placeholder="Buscar empresa, RFC, contacto…"
          className="flex-1 w-full sm:w-auto sm:min-w-[220px]"
        />
        <select
          value={estatus}
          onChange={(e) => { setEstatus(e.target.value); setPage(1); }}
          className="text-sm rounded-md border border-border bg-card px-2 py-1.5 text-foreground"
        >
          <option value="">Todos los estatus</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
          <option value="prospecto">Prospecto</option>
        </select>
        {(filtroQ || estatus) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFiltroQ(''); setEstatus(''); }}
          >
            Limpiar
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar selectedIds={selected} onClear={() => setSelected([])} />

      {/* Tabla */}
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded"
                title="Seleccionar página"
              />
            </th>
            <th
              className="p-3 text-left cursor-pointer select-none hover:text-foreground"
              onClick={() => toggleSort('nombre')}
            >
              Empresa <SortIndicator active={sort === 'nombre'} dir={dir} />
            </th>
            <th className="p-3 text-left">Contacto</th>
            <th className="p-3 text-left">RFC</th>
            <th className="p-2 text-center">Contactos</th>
            <th className="p-3 text-left">Estatus</th>
            <th className="p-3 text-left">Última compra</th>
            <th
              className="p-3 text-right cursor-pointer select-none hover:text-foreground"
              onClick={() => toggleSort('saldo')}
            >
              Saldo <SortIndicator active={sort === 'saldo'} dir={dir} />
            </th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={9}>Cargando clientes…</DataTableEmpty>
          )}
          {!isLoading && filtrados.length === 0 && (
            <DataTableEmpty colSpan={9}>
              <Users className="h-8 w-8 mx-auto text-muted-foreground/70 mb-2" />
              {filtroQDebounced || estatus ? 'Sin coincidencias con la búsqueda' : 'Sin clientes registrados'}
            </DataTableEmpty>
          )}
          {filtrados.map((c) => {
            const saldo = Number(c.saldo_actual) || 0;
            const isSelected = selected.includes(c.id);
            return (
              <DataTableRow key={c.id} className={isSelected ? 'bg-accent-glow/5' : undefined}>
                <td className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleRow(c.id)}
                    className="rounded"
                  />
                </td>
                <td className="p-3">
                  <div className="font-medium text-foreground truncate max-w-[180px]" title={c.nombre_empresa}>
                    {c.nombre_empresa}
                  </div>
                </td>
                <td className="p-3 text-muted-foreground text-xs">
                  {c.contacto_nombre || <span className="text-muted-foreground/70">—</span>}
                </td>
                <td className="p-3 font-mono text-xs text-muted-foreground">
                  {c.rfc_tax_id || <span className="text-muted-foreground/70">—</span>}
                </td>
                <td className="p-2 text-center"><Badge variant="slate">{c.n_contactos ?? 0}</Badge></td>
                <td className="p-3">{estatusBadge(c.estatus)}</td>
                <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                  {fmtDate(c.ultima_compra)}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {saldo > 0 ? (
                    <Badge variant="rose">{fmtMoney(c.moneda_credito, c.saldo_actual)}</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {fmtMoney(c.moneda_credito, c.saldo_actual)}
                    </span>
                  )}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => navigate(`/spa/empresas/${c.id}`)}
                    className="text-accent-deep hover:text-accent-deep/80 dark:text-accent-glow dark:hover:text-accent-glow/80 px-1.5 text-xs"
                    title="Ver ficha completa"
                  >
                    Ver
                  </button>
                  <button
                    onClick={() => setDetalle(c)}
                    className="text-muted-foreground hover:text-foreground px-1.5 text-xs"
                    title="Vista rápida"
                  >
                    ⊞
                  </button>
                  <button
                    onClick={() => setModalEditar(c)}
                    title="Editar"
                    className="text-foreground/80 hover:text-foreground px-1.5 text-xs"
                  >
                    Editar
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => onEliminar(c)}
                      title="Eliminar"
                      className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 px-1.5 text-xs"
                      disabled={eliminarMut.isPending}
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>

      {/* Paginación */}
      {showPagination && (
        <div className={`flex items-center justify-between text-sm text-muted-foreground ${isPlaceholderData ? 'opacity-50' : ''}`}>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isPlaceholderData}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
          </Button>
          <span>
            Página {page}
            {totalCount > 0 ? ` · ${totalCount} empresa(s)` : filtrados.length === PAGE_SIZE ? ' — hay más registros' : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(totalCount > 0 ? page * PAGE_SIZE >= totalForPagination : filtrados.length < PAGE_SIZE) || isPlaceholderData}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Modal crear */}
      {modalCrear && (
        <ClienteFormModal
          mode="create"
          onSave={(data) => crearMut.mutate(data)}
          onClose={() => setModalCrear(false)}
          busy={crearMut.isPending}
        />
      )}

      {/* Modal editar */}
      {modalEditar && (
        <ClienteFormModal
          mode="edit"
          cliente={modalEditar}
          onSave={(data) => editarMut.mutate({ id: modalEditar.id, payload: data })}
          onClose={() => setModalEditar(null)}
          busy={editarMut.isPending}
        />
      )}

      {/* Drawer detalle empresa (vista rápida) */}
      {detalle && (
        <EmpresaDetalleDrawer
          empresa={detalle}
          onEditarDatos={() => { setModalEditar(detalle); setDetalle(null); }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}
