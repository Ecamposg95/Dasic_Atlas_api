// web/src/features/superadmin/components/ResetPasswordPlataformaModal.tsx
// Modal para resetear contraseña desde la consola de plataforma.

import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import type { Usuario } from '@/features/usuarios/types';

type Props = {
  usuario: Usuario;
  onSave: (password: string) => void;
  onClose: () => void;
  busy: boolean;
};

export function ResetPasswordPlataformaModal({ usuario, onSave, onClose, busy }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function onSubmit() {
    setErr(null);
    if (password.length < 6) {
      setErr('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPwd) {
      setErr('Las contraseñas no coinciden.');
      return;
    }
    onSave(password);
  }

  return (
    <Modal
      title={`Reset contraseña: ${usuario.nombre}`}
      onClose={onClose}
      size="sm"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
      <div className="space-y-3">
        <p className="font-mono text-[11px] text-muted-foreground">
          {usuario.email} · {usuario.rol}
        </p>

        <FormField label="Nueva contraseña" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className="font-mono text-sm"
          />
        </FormField>
        <FormField label="Confirmar contraseña" required>
          <Input
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder="Repetir contraseña"
            className="font-mono text-sm"
          />
        </FormField>

        {err && (
          <div className="font-mono text-[11px] bg-rose-900/30 border border-rose-700/50 rounded p-2 text-rose-300">
            {err}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </ModalFooter>
      </form>
    </Modal>
  );
}
