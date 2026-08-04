import { useMemo, useState } from 'react';
import { Factory, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { confirm } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import {
  useActivos, useEliminarPlanta, useGuardarPlanta, usePlantas,
} from '../../hooks/useInstalaciones';
import type { Planta } from '../../types';

// ─── PlantasTab ──────────────────────────────────────────────────────────────
// Plantas (sitios/instalaciones) del cliente. El conteo de activos se calcula
// client-side desde el listado completo de activos (misma cache que ActivosTab
// sin filtro), sin endpoint extra.

export function PlantasTab({ clienteId }: { clienteId: number }) {
  const { data: plantas, isLoading } = usePlantas(clienteId);
  const { data: activos } = useActivos(clienteId);
  const eliminar = useEliminarPlanta(clienteId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Planta | null>(null);

  const conteoActivos = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of activos ?? []) {
      if (a.planta_id != null) map.set(a.planta_id, (map.get(a.planta_id) ?? 0) + 1);
    }
    return map;
  }, [activos]);

  function abrirNueva() { setEditing(null); setModalOpen(true); }
  function abrirEditar(p: Planta) { setEditing(p); setModalOpen(true); }

  async function onEliminar(p: Planta) {
    if (await confirm({ mensaje: `¿Eliminar la planta "${p.nombre}"?`, tono: 'danger' })) {
      eliminar.mutate(p.id);
    }
  }

  const lista = plantas ?? [];
  const vacio = !isLoading && lista.length === 0;

  return (
    <div className="p-1 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{lista.length} planta(s)</span>
        <Button size="sm" onClick={abrirNueva}><Plus className="h-3.5 w-3.5 mr-1" /> Nueva planta</Button>
      </div>

      {vacio ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState
            icon={Factory}
            title="Sin plantas registradas"
            description="Registra las plantas o sitios del cliente para ubicar sus activos instalados."
            action={<Button size="sm" onClick={abrirNueva}><Plus className="h-3.5 w-3.5 mr-1" /> Nueva planta</Button>}
          />
        </div>
      ) : (
        <DataTable maxBodyHeight="24rem">
          <DataTableHead sticky>
            <tr>
              <th className="p-3 text-left">Nombre</th>
              <th className="p-3 text-left">Ciudad</th>
              <th className="p-3 text-left">Dirección</th>
              <th className="p-3 text-center">Activos</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {isLoading && <DataTableEmpty colSpan={5}>Cargando plantas…</DataTableEmpty>}
            {lista.map((p) => (
              <DataTableRow key={p.id}>
                <td className="p-3 text-foreground font-medium">{p.nombre}</td>
                <td className="p-3 text-muted-foreground">{p.ciudad ?? '—'}</td>
                <td className="p-3 text-muted-foreground max-w-[16rem] truncate" title={p.direccion ?? undefined}>
                  {p.direccion ?? '—'}
                </td>
                <td className="p-3 text-center text-muted-foreground">{conteoActivos.get(p.id) ?? 0}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEditar(p)}
                      className="p-1 text-muted-foreground hover:text-accent-glow"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onEliminar(p)}
                      className="p-1 text-muted-foreground hover:text-rose-500"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      {modalOpen && (
        <PlantaFormModal
          key={editing?.id ?? 'new'}
          clienteId={clienteId}
          editing={editing}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─── PlantaFormModal ─────────────────────────────────────────────────────────

function PlantaFormModal({
  clienteId, editing, onClose,
}: {
  clienteId: number;
  editing: Planta | null;
  onClose: () => void;
}) {
  const guardar = useGuardarPlanta(clienteId);
  const [nombre, setNombre] = useState(editing?.nombre ?? '');
  const [direccion, setDireccion] = useState(editing?.direccion ?? '');
  const [ciudad, setCiudad] = useState(editing?.ciudad ?? '');
  const [notas, setNotas] = useState(editing?.notas ?? '');

  function onSave() {
    if (!nombre.trim()) { toast({ kind: 'warning', title: 'El nombre es obligatorio' }); return; }
    guardar.mutate(
      {
        id: editing?.id,
        data: {
          nombre: nombre.trim(),
          direccion: direccion.trim() || null,
          ciudad: ciudad.trim() || null,
          notas: notas.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: editing ? 'Planta actualizada' : 'Planta creada' });
          onClose();
        },
      },
    );
  }

  return (
    <Modal title={editing ? 'Editar planta' : 'Nueva planta'} onClose={onClose} size="md">
      <form onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        <div className="space-y-3">
          <FormField label="Nombre" required>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </FormField>
          <FormField label="Dirección">
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </FormField>
          <FormField label="Ciudad">
            <Input value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
          </FormField>
          <FormField label="Notas">
            <Textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </FormField>
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
