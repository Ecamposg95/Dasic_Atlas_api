import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useProveedores } from '../hooks/useProveedores';
import type { Proveedor, ProveedorCreatePayload } from '../types';

type Props = {
  onClose: () => void;
};

export function ProveedoresModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { data: proveedores, isLoading } = useProveedores();
  const [showForm, setShowForm] = useState(false);

  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const createMut = useMutation<Proveedor, { status?: number; detail?: string }, ProveedorCreatePayload>({
    mutationFn: (payload) => api.post<Proveedor>('/api/compras/proveedores', payload),
    onSuccess: (prov) => {
      qc.invalidateQueries({ queryKey: ['compras-proveedores'] });
      toast({ kind: 'success', title: 'Proveedor creado', description: prov.nombre_empresa });
      resetForm();
      setShowForm(false);
    },
    onError: (e) => {
      if (e.status === 401) { window.location.href = '/spa/login'; return; }
      if (e.status === 403) {
        toast({ kind: 'error', title: 'Sin permiso' });
        return;
      }
      setFormErr(e.detail ?? 'Error al crear proveedor');
    },
  });

  function resetForm() {
    setNombre(''); setContacto(''); setTelefono(''); setEmail(''); setFormErr(null);
  }

  function onSubmit() {
    setFormErr(null);
    if (!nombre.trim()) { setFormErr('El nombre de empresa es obligatorio.'); return; }
    createMut.mutate({
      nombre_empresa: nombre.trim(),
      contacto_nombre: contacto.trim() || undefined,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
    });
  }

  return (
    <Modal title="Proveedores" onClose={onClose} size="lg">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {/* Lista */}
        {isLoading && <div className="text-muted-foreground text-sm">Cargando proveedores…</div>}
        {!isLoading && (!proveedores || proveedores.length === 0) && (
          <div className="text-muted-foreground text-sm text-center py-4">Sin proveedores registrados.</div>
        )}
        {(proveedores ?? []).length > 0 && (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1.5 pr-2">Empresa</th>
                <th className="text-left py-1.5 px-2">Contacto</th>
                <th className="text-left py-1.5 px-2">Teléfono</th>
                <th className="text-right py-1.5 pl-2">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {(proveedores ?? []).map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-surface-2/60">
                  <td className="py-1.5 pr-2 font-medium text-foreground">{p.nombre_empresa}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{p.contacto_nombre ?? '—'}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{p.telefono ?? '—'}</td>
                  <td className="py-1.5 pl-2 text-right font-mono text-foreground">
                    ${Number(p.saldo_actual || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Formulario nuevo proveedor */}
        {showForm && (
          <div className="border border-border-strong rounded-lg p-3 space-y-2 bg-surface-2">
            <div className="text-sm font-medium text-foreground mb-2">Nuevo proveedor</div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Nombre empresa <span className="text-rose-600 dark:text-rose-400">*</span>
              </label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Proveedor S.A. de C.V."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Contacto</label>
                <Input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Nombre contacto" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
                <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="55 1234 5678" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ventas@proveedor.com"
              />
            </div>
            {formErr && (
              <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">
                {formErr}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); resetForm(); }}
                disabled={createMut.isPending}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={onSubmit} disabled={createMut.isPending}>
                {createMut.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}
      </div>
      <ModalFooter>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            + Nuevo proveedor
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
