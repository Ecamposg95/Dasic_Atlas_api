// web/src/features/superadmin/components/UsuarioPlataformaModal.tsx
// Modal de creación/edición de usuarios para la consola de plataforma.
// Incluye superadmin en la lista de roles (a diferencia del UsuarioFormModal regular).

import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { branding } from '@/lib/branding';
import type { Usuario, UsuarioCreate, UsuarioUpdate, RolUsuario } from '@/features/usuarios/types';

// Todos los roles — incluye superadmin (gestionado solo desde aquí)
const ROL_OPTIONS: { value: RolUsuario; label: string }[] = [
  { value: 'superadmin',        label: 'Superadmin' },
  { value: 'administrador',     label: 'Administrador' },
  { value: 'gerente_comercial', label: 'Gerente Comercial' },
  { value: 'ventas',            label: 'Ventas' },
  { value: 'operativo',         label: 'Operativo' },
];

type CreateProps = {
  mode: 'create';
  usuario?: undefined;
  onSave: (data: UsuarioCreate) => void;
  onClose: () => void;
  busy: boolean;
};

type EditProps = {
  mode: 'edit';
  usuario: Usuario;
  onSave: (data: UsuarioUpdate) => void;
  onClose: () => void;
  busy: boolean;
};

type Props = CreateProps | EditProps;

export function UsuarioPlataformaModal({ mode, usuario, onSave, onClose, busy }: Props) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [rol, setRol] = useState<RolUsuario>(
    (usuario?.rol as RolUsuario) ?? 'administrador',
  );
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (nombre.trim().length < 2) {
      setErr('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (!email.trim()) {
      setErr('El correo es requerido.');
      return;
    }
    if (mode === 'create') {
      if (password.length < 6) {
        setErr('La contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setErr('Las contraseñas no coinciden.');
        return;
      }
      (onSave as CreateProps['onSave'])({
        nombre: nombre.trim(),
        email: email.trim(),
        rol,
        activo,
        password,
      });
    } else {
      (onSave as EditProps['onSave'])({
        nombre: nombre.trim(),
        email: email.trim(),
        rol,
        activo,
      });
    }
  }

  return (
    <Modal
      title={mode === 'create' ? 'Nuevo usuario de plataforma' : `Editar: ${usuario?.nombre ?? ''}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {/* Nombre */}
        <div>
          <label className="block font-mono text-[11px] text-emerald-500/80 mb-1">
            Nombre <span className="text-rose-400">*</span>
          </label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo"
            className="font-mono text-sm"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block font-mono text-[11px] text-emerald-500/80 mb-1">
            Correo electrónico <span className="text-rose-400">*</span>
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={branding.emailPlaceholder}
            className="font-mono text-sm"
          />
        </div>

        {/* Rol */}
        <div>
          <label className="block font-mono text-[11px] text-emerald-500/80 mb-1">Rol</label>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as RolUsuario)}
            className="h-10 w-full rounded-md border border-emerald-500/30 bg-card px-3 font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {ROL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {rol === 'superadmin' && (
            <p className="font-mono text-[10px] text-amber-400 mt-1">
              Superadmin tiene acceso total a la consola de plataforma.
            </p>
          )}
        </div>

        {/* Activo */}
        <div className="flex items-center gap-2">
          <input
            id="plat-activo-check"
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="rounded border-emerald-500/40"
          />
          <label htmlFor="plat-activo-check" className="font-mono text-xs text-foreground">
            Usuario activo
          </label>
        </div>

        {/* Password (solo en create) */}
        {mode === 'create' && (
          <>
            <div>
              <label className="block font-mono text-[11px] text-emerald-500/80 mb-1">
                Contraseña <span className="text-rose-400">*</span>
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] text-emerald-500/80 mb-1">
                Confirmar contraseña <span className="text-rose-400">*</span>
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetir contraseña"
                className="font-mono text-sm"
              />
            </div>
          </>
        )}

        {/* Error inline */}
        {err && (
          <div className="font-mono text-[11px] bg-rose-900/30 border border-rose-700/50 rounded p-2 text-rose-300">
            {err}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={busy}>
          {busy
            ? 'Guardando…'
            : mode === 'create'
            ? 'Crear usuario'
            : 'Guardar cambios'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
