// web/src/features/servicios/pages/ServiciosPage.tsx
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListToolbar } from '@/components/ui/list-toolbar';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import {
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHead,
  DataTableRow,
} from '@/components/ui/data-table';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { useAuth } from '@/stores/auth';
import { useServicios, SERVICIOS_PAGE_SIZE } from '../hooks/useServicios';
import { useCategoriasServicio } from '../hooks/useCategoriasServicio';
import { ServicioFormModal } from '../components/ServicioFormModal';
import type { Servicio, ServicioCreate, ServicioUpdate } from '../types';

type ApiErr = { status?: number; detail?: string };

function fmtCosto(moneda: string, valor: number | string) {
  const n = Number(valor) || 0;
  return `${moneda} $${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export function ServiciosPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();

  const [filtroQ, setFiltroQ] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [page, setPage] = useState(1);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalEditar, setModalEditar] = useState<Servicio | null>(null);

  // Debounce de la búsqueda para no disparar una request por tecla
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(filtroQ), 300);
    return () => clearTimeout(t);
  }, [filtroQ]);

  // Resetear a la primera página cuando cambian los filtros
  useEffect(() => {
    setPage(1);
  }, [qDebounced, filtroCategoria]);

  const { data, isLoading, isPlaceholderData, error } = useServicios({
    q: qDebounced || undefined,
    categoria: filtroCategoria || undefined,
    page,
  });
  const { data: categoriasData } = useCategoriasServicio();

  useEffect(() => {
    const status = (error as ApiErr | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / SERVICIOS_PAGE_SIZE));

  const isAdminOrAsistente =
    user?.rol === 'administrador' ||
    user?.rol === 'gerente_comercial' ||
    // legacy aliases
    user?.rol === 'admin' ||
    user?.rol === 'asistente';

  const canDelete =
    user?.rol === 'administrador' || user?.rol === 'admin';

  const crearMut = useMutation<Servicio, ApiErr, ServicioCreate>({
    mutationFn: (body) => api.post<Servicio>('/api/servicios/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicios'] });
      qc.invalidateQueries({ queryKey: ['servicios-categorias'] });
      toast({ kind: 'success', title: 'Servicio creado' });
      setModalCrear(false);
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else toast({ kind: 'error', title: 'No se pudo crear', description: e.detail });
    },
  });

  const editarMut = useMutation<Servicio, ApiErr, { id: number; payload: ServicioUpdate }>({
    mutationFn: ({ id, payload }) => api.put<Servicio>(`/api/servicios/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicios'] });
      qc.invalidateQueries({ queryKey: ['servicios-categorias'] });
      toast({ kind: 'success', title: 'Servicio actualizado' });
      setModalEditar(null);
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else toast({ kind: 'error', title: 'No se pudo actualizar', description: e.detail });
    },
  });

  const eliminarMut = useMutation<unknown, ApiErr, number>({
    mutationFn: (id) => api.delete(`/api/servicios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicios'] });
      qc.invalidateQueries({ queryKey: ['servicios-categorias'] });
      toast({
        kind: 'success',
        title: 'Servicio eliminado (o marcado inactivo si tiene referencias)',
      });
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else toast({ kind: 'error', title: 'No se pudo eliminar', description: e.detail });
    },
  });

  async function onEliminar(s: Servicio) {
    if (
      await confirm({
        mensaje: `¿Eliminar el servicio "${s.nombre}" (${s.codigo})? Si tiene referencias en cotizaciones se marcará inactivo.`,
        tono: 'danger',
      })
    ) {
      eliminarMut.mutate(s.id);
    }
  }

  const categorias = categoriasData?.items.map((i) => i.categoria) ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-cyan-400" /> Servicios
          </span>
        }
        actions={
          <>
            <span className="text-xs text-muted-foreground">{total} servicio(s)</span>
            {isAdminOrAsistente && (
              <Button size="sm" onClick={() => setModalCrear(true)}>
                + Nuevo servicio
              </Button>
            )}
          </>
        }
      />

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-3">
        <ListToolbar
          search={filtroQ}
          onSearchChange={setFiltroQ}
          searchPlaceholder="Buscar código, nombre, descripción…"
          filters={
            <>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="h-10 rounded-md border border-border-strong bg-card text-foreground px-3 text-sm"
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {(filtroQ || filtroCategoria) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFiltroQ('');
                    setFiltroCategoria('');
                  }}
                >
                  Limpiar
                </Button>
              )}
            </>
          }
        />
      </div>

      {/* Tabla */}
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-3 text-left">Código</th>
            <th className="p-3 text-left">Nombre</th>
            <th className="p-3 text-left">Categoría</th>
            <th className="p-3 text-right">Costo</th>
            <th className="p-3 text-left">Estado</th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={6}>Cargando servicios…</DataTableEmpty>
          )}
          {!isLoading && items.length === 0 && (
            <DataTableEmpty colSpan={6}>
              <Wrench className="h-8 w-8 mx-auto text-muted-foreground/70 mb-2" />
              {!qDebounced && !filtroCategoria
                ? 'Sin servicios registrados'
                : 'Sin coincidencias con la búsqueda'}
            </DataTableEmpty>
          )}
          {items.map((s) => (
            <DataTableRow key={s.id}>
              <td className="p-3 font-mono text-xs text-cyan-700 dark:text-cyan-300">{s.codigo}</td>
              <td className="p-3 font-medium text-foreground">{s.nombre}</td>
              <td className="p-3">
                {s.categoria_servicio ? (
                  <Badge variant="violet">{s.categoria_servicio}</Badge>
                ) : (
                  <span className="text-muted-foreground/70 text-xs">—</span>
                )}
              </td>
              <td className="p-3 text-right whitespace-nowrap">
                <Badge variant="amber">{fmtCosto(s.moneda, s.costo)}</Badge>
              </td>
              <td className="p-3">
                {s.activo ? (
                  <Badge variant="emerald">Activo</Badge>
                ) : (
                  <Badge variant="slate">Inactivo</Badge>
                )}
              </td>
              <td className="p-3 text-right whitespace-nowrap space-x-1">
                {isAdminOrAsistente && (
                  <button
                    onClick={() => setModalEditar(s)}
                    className="text-muted-foreground hover:text-foreground px-1.5 text-xs"
                  >
                    Editar
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => onEliminar(s)}
                    disabled={eliminarMut.isPending}
                    className="text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 px-1.5 text-xs disabled:opacity-40"
                  >
                    Eliminar
                  </button>
                )}
              </td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {/* Paginación */}
      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        isLoading={isPlaceholderData}
      />

      {modalCrear && (
        <ServicioFormModal
          mode="create"
          onSave={(data) => crearMut.mutate(data)}
          onClose={() => setModalCrear(false)}
          busy={crearMut.isPending}
        />
      )}

      {modalEditar && (
        <ServicioFormModal
          mode="edit"
          servicio={modalEditar}
          onSave={(data) => editarMut.mutate({ id: modalEditar.id, payload: data })}
          onClose={() => setModalEditar(null)}
          busy={editarMut.isPending}
        />
      )}
    </div>
  );
}
