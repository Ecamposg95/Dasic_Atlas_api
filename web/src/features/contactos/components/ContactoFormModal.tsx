import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { toast } from '@/lib/toast';
import { useClientes } from '@/features/clientes/hooks/useClientes';
import { useGuardarContacto } from '../hooks/useContactoMutations';
import type { Contacto, ContactoGlobal } from '../types';

export function ContactoFormModal({
  open,
  onClose,
  editing,
  clienteIdFijo,
}: {
  open: boolean;
  onClose: () => void;
  editing: Contacto | ContactoGlobal | null;
  clienteIdFijo?: number;
}) {
  const { data: empresas } = useClientes({ page: 1, q: '', pageSize: 500 });
  const [empresaId, setEmpresaId] = useState<number | null>(clienteIdFijo ?? editing?.cliente_id ?? null);
  const [nombre, setNombre] = useState(editing?.nombre ?? '');
  const [cargo, setCargo] = useState(editing?.cargo ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [telefono, setTelefono] = useState(editing?.telefono ?? '');
  const [esPrincipal, setEsPrincipal] = useState(editing?.es_principal ?? false);

  const guardar = useGuardarContacto(empresaId ?? 0);

  if (!open) return null;

  function onSave() {
    if (!empresaId) { toast({ kind: 'warning', title: 'Elige una empresa' }); return; }
    if (!nombre.trim()) { toast({ kind: 'warning', title: 'El nombre es obligatorio' }); return; }
    guardar.mutate(
      {
        id: editing?.id,
        data: {
          nombre: nombre.trim(),
          cargo: cargo.trim() || null,
          email: email.trim() || null,
          telefono: telefono.trim() || null,
          es_principal: esPrincipal,
        },
      },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: editing ? 'Contacto actualizado' : 'Contacto creado' });
          onClose();
        },
        onError: (e) => {
          const err = e as { status?: number; detail?: string };
          if (err.status === 401) { window.location.href = '/spa/login'; return; }
          toast({ kind: 'error', title: 'No se pudo guardar', description: err.detail });
        },
      },
    );
  }

  return (
    <Modal title={editing ? 'Editar contacto' : 'Nuevo contacto'} onClose={onClose} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <div className="space-y-3">
          {clienteIdFijo == null && (
            <FormField label="Empresa" required>
              {editing ? (
                <div className="text-sm text-foreground">{(editing as ContactoGlobal).empresa_nombre}</div>
              ) : (
                <select
                  value={empresaId ?? ''}
                  onChange={(e) => setEmpresaId(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="w-full h-9 text-sm rounded border border-border-strong bg-card px-2"
                >
                  <option value="">— Elige empresa —</option>
                  {(empresas ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre_empresa}</option>
                  ))}
                </select>
              )}
            </FormField>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Nombre" required>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </FormField>
            <FormField label="Cargo">
              <Input value={cargo} onChange={(e) => setCargo(e.target.value)} />
            </FormField>
            <FormField label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label="Teléfono">
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={esPrincipal} onChange={(e) => setEsPrincipal(e.target.checked)} />
            Contacto principal de la empresa
          </label>
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
