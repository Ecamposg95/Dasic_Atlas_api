// web/src/features/superadmin/components/ResetPasswordPlataformaModal.tsx
// Modal para resetear contraseña desde la consola de plataforma.

import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
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
      <div className="space-y-3">
        <p className="font-mono text-[11px] text-muted-foreground">
          {usuario.email} · {usuario.rol}
        </p>

        <div>
          <label className="block font-mono text-[11px] text-emerald-500/80 mb-1">
            Nueva contraseña <span className="text-rose-400">*</span>
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
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder="Repetir contraseña"
            className="font-mono text-sm"
          />
        </div>

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
          {busy ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
