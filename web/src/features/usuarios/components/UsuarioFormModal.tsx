// web/src/features/usuarios/components/UsuarioFormModal.tsx
import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { branding } from '@/lib/branding';
import type { Usuario, UsuarioCreate, UsuarioUpdate, RolUsuario } from '../types';

const ROL_OPTIONS: { value: RolUsuario; label: string }[] = [
  { value: 'administrador', label: 'Administrador' },
  { value: 'gerente_comercial', label: 'Gerente Comercial' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'operativo', label: 'Operativo' },
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

export function UsuarioFormModal({ mode, usuario, onSave, onClose, busy }: Props) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [rol, setRol] = useState<RolUsuario>(
    (usuario?.rol as RolUsuario) ?? 'ventas',
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
      (onSave as EditProps['onSave'])({ nombre: nombre.trim(), email: email.trim(), rol, activo });
    }
  }

  return (
    <Modal
      title={mode === 'create' ? 'Nuevo usuario' : `Editar: ${usuario?.nombre ?? ''}`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
      <div className="space-y-3">
        <FormField label="Nombre" required>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo"
          />
        </FormField>

        <FormField label="Correo electrónico" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={branding.emailPlaceholder}
          />
        </FormField>

        <FormField label="Rol">
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as RolUsuario)}
            className="h-10 w-full rounded-md border border-border-strong bg-card px-3 text-sm text-foreground"
          >
            {ROL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>

        <div className="flex items-center gap-2">
          <input
            id="activo-check"
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="rounded border-border-strong bg-card"
          />
          <label htmlFor="activo-check" className="text-sm text-foreground">
            Usuario activo
          </label>
        </div>

        {mode === 'create' && (
          <>
            <FormField label="Contraseña" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
            </FormField>
            <FormField label="Confirmar contraseña" required>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetir contraseña"
              />
            </FormField>
          </>
        )}

        {err && (
          <div className="text-xs bg-rose-50 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700/50 rounded p-2 text-rose-700 dark:text-rose-300">
            {err}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
        </Button>
      </ModalFooter>
      </form>
    </Modal>
  );
}
