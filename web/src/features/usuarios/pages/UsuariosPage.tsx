// web/src/features/usuarios/pages/UsuariosPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListToolbar } from '@/components/ui/list-toolbar';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
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
import { useUsuarios } from '../hooks/useUsuarios';
import { UsuarioFormModal } from '../components/UsuarioFormModal';
import { CambiarPasswordModal } from '../components/CambiarPasswordModal';
import type { Usuario, UsuarioCreate, UsuarioUpdate } from '../types';

const ROL_LABELS: Record<string, string> = {
  administrador: 'Administrador',
  gerente_comercial: 'Gerente Comercial',
  ventas: 'Ventas',
  operativo: 'Operativo',
  superadmin: 'Super Admin',
};

type ApiErr = { status?: number; detail?: string };

export function UsuariosPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();

  // Guard: solo administradores pueden gestionar usuarios
  useEffect(() => {
    if (user !== null && !user['gestionar_usuarios']) {
      toast({ kind: 'error', title: 'Solo administradores' });
      navigate('/spa/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const [modalCrear, setModalCrear] = useState(false);
  const [modalEditar, setModalEditar] = useState<Usuario | null>(null);
  const [modalPassword, setModalPassword] = useState<Usuario | null>(null);

  // Filtros client-side (los usuarios son pocos)
  const [search, setSearch] = useState('');
  const [rolFiltro, setRolFiltro] = useState('');
  const [activoFiltro, setActivoFiltro] = useState('');

  const { data: usuarios, isLoading, error } = useUsuarios();

  useEffect(() => {
    const status = (error as ApiErr | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  const crearMut = useMutation<Usuario, ApiErr, UsuarioCreate>({
    mutationFn: (body) => api.post<Usuario>('/api/usuarios/', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast({ kind: 'success', title: 'Usuario creado' });
      setModalCrear(false);
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else toast({ kind: 'error', title: 'No se pudo crear', description: e.detail });
    },
  });

  const editarMut = useMutation<Usuario, ApiErr, { id: number; payload: UsuarioUpdate }>({
    mutationFn: ({ id, payload }) => api.put<Usuario>(`/api/usuarios/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast({ kind: 'success', title: 'Usuario actualizado' });
      setModalEditar(null);
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else toast({ kind: 'error', title: 'No se pudo actualizar', description: e.detail });
    },
  });

  const passwordMut = useMutation<unknown, ApiErr, { id: number; password: string }>({
    mutationFn: ({ id, password }) =>
      api.post(`/api/usuarios/${id}/password`, { password }),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Contraseña actualizada' });
      setModalPassword(null);
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else
        toast({
          kind: 'error',
          title: 'No se pudo cambiar contraseña',
          description: e.detail,
        });
    },
  });

  const eliminarMut = useMutation<unknown, ApiErr, number>({
    mutationFn: (id) => api.delete(`/api/usuarios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      toast({ kind: 'success', title: 'Usuario eliminado' });
    },
    onError: (e) => {
      if (e.status === 401) window.location.href = '/spa/login';
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else toast({ kind: 'error', title: 'No se pudo eliminar', description: e.detail });
    },
  });

  async function onEliminar(u: Usuario) {
    if (
      await confirm({
        mensaje: `¿Eliminar al usuario "${u.nombre}" (${u.email})? Esta acción no se puede deshacer.`,
        tono: 'danger',
      })
    ) {
      eliminarMut.mutate(u.id);
    }
  }

  const todos = usuarios ?? [];

  // Roles presentes para poblar el dropdown (sin inventar opciones inexistentes)
  const rolesPresentes = useMemo(
    () => Array.from(new Set(todos.map((u) => u.rol))).sort(),
    [todos],
  );

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return todos.filter((u) => {
      if (q && !u.nombre.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false;
      }
      if (rolFiltro && u.rol !== rolFiltro) return false;
      if (activoFiltro === 'activo' && !u.activo) return false;
      if (activoFiltro === 'inactivo' && u.activo) return false;
      return true;
    });
  }, [todos, search, rolFiltro, activoFiltro]);

  const hasFiltros = Boolean(search.trim() || rolFiltro || activoFiltro);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-cyan-400" /> Usuarios
          </span>
        }
        actions={
          <>
            <span className="text-xs text-muted-foreground">
              {hasFiltros ? `${items.length} de ${todos.length}` : `${todos.length}`} usuario(s)
            </span>
            <Button size="sm" onClick={() => setModalCrear(true)}>
              + Nuevo usuario
            </Button>
          </>
        }
      />

      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nombre o email…"
        filters={
          <>
            <select
              value={rolFiltro}
              onChange={(e) => setRolFiltro(e.target.value)}
              className="text-sm rounded-md border border-border bg-surface-2 px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent-glow"
            >
              <option value="">Todos los roles</option>
              {rolesPresentes.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABELS[r] ?? r}
                </option>
              ))}
            </select>
            <select
              value={activoFiltro}
              onChange={(e) => setActivoFiltro(e.target.value)}
              className="text-sm rounded-md border border-border bg-surface-2 px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-accent-glow"
            >
              <option value="">Activos e inactivos</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>
          </>
        }
      />

      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-3 text-left">Nombre</th>
            <th className="p-3 text-left">Email</th>
            <th className="p-3 text-left">Rol</th>
            <th className="p-3 text-left">Estado</th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={5}>Cargando usuarios…</DataTableEmpty>
          )}
          {!isLoading && items.length === 0 && (
            <DataTableEmpty colSpan={5}>
              <EmptyState
                icon={UserCog}
                title={hasFiltros ? 'Sin coincidencias con los filtros' : 'Sin usuarios registrados'}
                className="py-0"
              />
            </DataTableEmpty>
          )}
          {items.map((u) => (
            <DataTableRow key={u.id}>
              <td className="p-3 font-medium text-foreground">{u.nombre}</td>
              <td className="p-3 text-xs text-muted-foreground">{u.email}</td>
              <td className="p-3">
                <Badge variant="cyan">{ROL_LABELS[u.rol] ?? u.rol}</Badge>
              </td>
              <td className="p-3">
                {u.activo ? (
                  <Badge variant="emerald">Activo</Badge>
                ) : (
                  <Badge variant="slate">Inactivo</Badge>
                )}
              </td>
              <td className="p-3 text-right whitespace-nowrap space-x-1">
                <button
                  onClick={() => setModalEditar(u)}
                  className="text-muted-foreground hover:text-foreground px-1.5 text-xs"
                >
                  Editar
                </button>
                <button
                  onClick={() => setModalPassword(u)}
                  className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 px-1.5 text-xs"
                >
                  Contraseña
                </button>
                <button
                  onClick={() => onEliminar(u)}
                  disabled={eliminarMut.isPending || u.id === user?.id}
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 px-1.5 text-xs disabled:opacity-40"
                  title={
                    u.id === user?.id
                      ? 'No puedes eliminarte a ti mismo'
                      : 'Eliminar'
                  }
                >
                  Eliminar
                </button>
              </td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {modalCrear && (
        <UsuarioFormModal
          mode="create"
          onSave={(data) => crearMut.mutate(data)}
          onClose={() => setModalCrear(false)}
          busy={crearMut.isPending}
        />
      )}

      {modalEditar && (
        <UsuarioFormModal
          mode="edit"
          usuario={modalEditar}
          onSave={(data) => editarMut.mutate({ id: modalEditar.id, payload: data })}
          onClose={() => setModalEditar(null)}
          busy={editarMut.isPending}
        />
      )}

      {modalPassword && (
        <CambiarPasswordModal
          usuario={modalPassword}
          onSave={(password) =>
            passwordMut.mutate({ id: modalPassword.id, password })
          }
          onClose={() => setModalPassword(null)}
          busy={passwordMut.isPending}
        />
      )}
    </div>
  );
}
