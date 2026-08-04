// web/src/features/superadmin/pages/UsuariosPlataformaPage.tsx
// Gestión de usuarios de plataforma (incluye crear/promover superadmins).
// Dev-styled: emerald/mono, consistente con SaludPage/MantenimientoPage.

import { useState } from 'react';
import { UserCog, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHead,
  DataTableRow,
} from '@/components/ui/data-table';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { normalizeDetail } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import type { Usuario, UsuarioCreate, UsuarioUpdate } from '@/features/usuarios/types';
import {
  useUsuariosPlataforma,
  useCrearUsuario,
  useEditarUsuario,
  useResetPassword,
  useEliminarUsuario,
} from '../hooks/useUsuariosPlataforma';
import { PlatformShell } from '../components/PlatformShell';
import { UsuarioPlataformaModal } from '../components/UsuarioPlataformaModal';
import { ResetPasswordPlataformaModal } from '../components/ResetPasswordPlataformaModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROL_LABELS: Record<string, string> = {
  superadmin:        'Superadmin',
  administrador:     'Administrador',
  gerente_comercial: 'Gerente Comercial',
  ventas:            'Ventas',
  operativo:         'Operativo',
};

type BadgeVariant = 'emerald' | 'cyan' | 'violet' | 'slate';

function rolBadgeVariant(rol: string): BadgeVariant {
  if (rol === 'superadmin')        return 'emerald';
  if (rol === 'administrador')     return 'cyan';
  if (rol === 'gerente_comercial') return 'violet';
  return 'slate';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function UsuariosPlataformaPage() {
  const currentUser = useAuth((s) => s.user);

  const [modalCrear, setModalCrear]       = useState(false);
  const [modalEditar, setModalEditar]     = useState<Usuario | null>(null);
  const [modalPassword, setModalPassword] = useState<Usuario | null>(null);

  const { data: usuarios, isLoading, isError } = useUsuariosPlataforma();

  const crearMut    = useCrearUsuario();
  const editarMut   = useEditarUsuario();
  const passwordMut = useResetPassword();
  const eliminarMut = useEliminarUsuario();

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleCrear(data: UsuarioCreate) {
    crearMut.mutate(data, {
      onSuccess: () => {
        toast({ kind: 'success', title: 'Usuario creado' });
        setModalCrear(false);
      },
      onError: (e) => {
        toast({
          kind: 'error',
          title: 'No se pudo crear',
          description: normalizeDetail(e.detail, 'Error desconocido'),
        });
      },
    });
  }

  function handleEditar(data: UsuarioUpdate) {
    if (!modalEditar) return;
    editarMut.mutate(
      { id: modalEditar.id, payload: data },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: 'Usuario actualizado' });
          setModalEditar(null);
        },
        onError: (e) => {
          toast({
            kind: 'error',
            title: 'No se pudo actualizar',
            description: normalizeDetail(e.detail, 'Error desconocido'),
          });
        },
      },
    );
  }

  function handlePassword(password: string) {
    if (!modalPassword) return;
    passwordMut.mutate(
      { id: modalPassword.id, password },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: 'Contraseña actualizada' });
          setModalPassword(null);
        },
        onError: (e) => {
          toast({
            kind: 'error',
            title: 'No se pudo cambiar contraseña',
            description: normalizeDetail(e.detail, 'Error desconocido'),
          });
        },
      },
    );
  }

  function handleToggleActivo(u: Usuario) {
    editarMut.mutate(
      { id: u.id, payload: { activo: !u.activo } },
      {
        onSuccess: () => {
          toast({
            kind: 'success',
            title: u.activo ? 'Usuario desactivado' : 'Usuario activado',
          });
        },
        onError: (e) => {
          toast({
            kind: 'error',
            title: 'No se pudo cambiar estado',
            description: normalizeDetail(e.detail, 'Error desconocido'),
          });
        },
      },
    );
  }

  async function handleEliminar(u: Usuario) {
    const ok = await confirm({
      titulo: 'Eliminar usuario',
      mensaje: `¿Eliminar al usuario "${u.nombre}" (${u.email})?\nEsta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tono: 'danger',
    });
    if (!ok) return;
    eliminarMut.mutate(u.id, {
      onSuccess: () => {
        toast({ kind: 'success', title: 'Usuario eliminado' });
      },
      onError: (e) => {
        toast({
          kind: 'error',
          title: 'No se pudo eliminar',
          description: normalizeDetail(e.detail, 'Error desconocido'),
        });
      },
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const items = usuarios ?? [];
  const isSelf = (u: Usuario) => u.id === (currentUser as { id?: number } | null)?.id;

  return (
    <PlatformShell title="Usuarios de plataforma">
      <div className="max-w-5xl space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-mono text-xs text-muted-foreground">
            {items.length} usuario(s) registrado(s) · incluye todos los roles
          </p>
          <button
            type="button"
            onClick={() => setModalCrear(true)}
            className="flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Nuevo usuario
          </button>
        </div>

        {/* Loading / Error */}
        {isLoading && (
          <p className="font-mono text-sm text-muted-foreground">Cargando usuarios…</p>
        )}
        {isError && (
          <div className="font-mono text-sm text-rose-400 flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Error al cargar usuarios. ¿Tienes permisos de superadmin?
          </div>
        )}

        {/* Table */}
        {!isLoading && (
          <div className="rounded-xl border border-emerald-500/20 overflow-hidden">
            <DataTable>
              <DataTableHead>
                <tr>
                  <th className="p-3 text-left font-mono text-[11px] uppercase tracking-widest text-emerald-500/70 font-normal">
                    Nombre
                  </th>
                  <th className="p-3 text-left font-mono text-[11px] uppercase tracking-widest text-emerald-500/70 font-normal">
                    Email
                  </th>
                  <th className="p-3 text-left font-mono text-[11px] uppercase tracking-widest text-emerald-500/70 font-normal">
                    Rol
                  </th>
                  <th className="p-3 text-left font-mono text-[11px] uppercase tracking-widest text-emerald-500/70 font-normal">
                    Estado
                  </th>
                  <th className="p-3 text-right font-mono text-[11px] uppercase tracking-widest text-emerald-500/70 font-normal">
                    Acciones
                  </th>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {items.length === 0 && (
                  <DataTableEmpty colSpan={5}>
                    <UserCog className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <span className="font-mono text-xs text-muted-foreground">Sin usuarios registrados</span>
                  </DataTableEmpty>
                )}
                {items.map((u) => (
                  <DataTableRow
                    key={u.id}
                    className={isSelf(u) ? 'bg-emerald-500/[0.04]' : undefined}
                  >
                    {/* Nombre */}
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-medium text-foreground">
                          {u.nombre}
                        </span>
                        {isSelf(u) && (
                          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                            tú
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Email */}
                    <td className="p-3">
                      <span className="font-mono text-xs text-muted-foreground">{u.email}</span>
                    </td>

                    {/* Rol */}
                    <td className="p-3">
                      <Badge variant={rolBadgeVariant(u.rol)}>
                        {ROL_LABELS[u.rol] ?? u.rol}
                      </Badge>
                    </td>

                    {/* Estado */}
                    <td className="p-3">
                      {u.activo ? (
                        <Badge variant="emerald">activo</Badge>
                      ) : (
                        <Badge variant="slate">inactivo</Badge>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="p-3 text-right whitespace-nowrap space-x-1">
                      <button
                        type="button"
                        onClick={() => setModalEditar(u)}
                        className="font-mono text-xs text-muted-foreground hover:text-emerald-400 px-1.5 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalPassword(u)}
                        className="font-mono text-xs text-amber-500/80 hover:text-amber-400 px-1.5 transition-colors"
                      >
                        Password
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActivo(u)}
                        disabled={editarMut.isPending || isSelf(u)}
                        className="font-mono text-xs text-muted-foreground hover:text-accent-glow px-1.5 transition-colors disabled:opacity-40"
                        title={isSelf(u) ? 'No puedes desactivarte a ti mismo' : u.activo ? 'Desactivar' : 'Activar'}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEliminar(u)}
                        disabled={eliminarMut.isPending || isSelf(u)}
                        className="font-mono text-xs text-rose-500/70 hover:text-rose-400 px-1.5 transition-colors disabled:opacity-40"
                        title={isSelf(u) ? 'No puedes eliminarte a ti mismo' : 'Eliminar'}
                      >
                        Eliminar
                      </button>
                    </td>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}

        {/* Note */}
        <p className="font-mono text-[10px] text-muted-foreground">
          Los cambios de rol se aplican en el siguiente login del usuario afectado. Los guard-errors del backend (último superadmin, auto-degradación) aparecen como toast.
        </p>
      </div>

      {/* Modales */}
      {modalCrear && (
        <UsuarioPlataformaModal
          mode="create"
          onSave={handleCrear}
          onClose={() => setModalCrear(false)}
          busy={crearMut.isPending}
        />
      )}

      {modalEditar && (
        <UsuarioPlataformaModal
          mode="edit"
          usuario={modalEditar}
          onSave={handleEditar}
          onClose={() => setModalEditar(null)}
          busy={editarMut.isPending}
        />
      )}

      {modalPassword && (
        <ResetPasswordPlataformaModal
          usuario={modalPassword}
          onSave={handlePassword}
          onClose={() => setModalPassword(null)}
          busy={passwordMut.isPending}
        />
      )}
    </PlatformShell>
  );
}
