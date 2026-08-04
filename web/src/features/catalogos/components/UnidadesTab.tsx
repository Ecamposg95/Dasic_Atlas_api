import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalFooter } from '@/components/ui/modal';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useUnidades } from '../hooks/useUnidades';
import type { Unidad } from '../types';

// ─── RenombrarModal ──────────────────────────────────────────────────────────

function RenombrarModal({
  unidad,
  onClose,
  onSaved,
}: {
  unidad: Unidad;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(unidad.nombre);
  const [err, setErr] = useState<string | null>(null);

  // NOTA (Task 9, ajuste mínimo de compile): este PUT sigue siendo el
  // endpoint legacy `/unidades/rename`, que muta `productos.unidad` (texto
  // libre) — NO el catálogo administrable `unidades_medida` que ahora lista
  // este tab (Task 4). Quedó desacoplado desde entonces; migrar este flujo
  // al PATCH /unidades/{id} es trabajo de UI pendiente (Task 10/11), fuera
  // del alcance de tipos/store/hooks de este task.
  const renameMut = useMutation<unknown, { status?: number; detail?: string }, { antiguo: string; nuevo: string }>({
    mutationFn: (payload) => api.put('/api/catalogos/unidades/rename', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'unidades'] });
      toast({ kind: 'success', title: 'Unidad renombrada' });
      onSaved();
    },
    onError: (e) => {
      if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else setErr(e.detail ?? 'No se pudo renombrar.');
    },
  });

  function onSubmit() {
    setErr(null);
    const nuevoTrim = nuevo.trim().toUpperCase();
    if (!nuevoTrim) { setErr('El nombre no puede estar vacío.'); return; }
    if (nuevoTrim === unidad.nombre) { onClose(); return; }
    renameMut.mutate({ antiguo: unidad.nombre, nuevo: nuevoTrim });
  }

  return (
    <Modal title="Renombrar unidad" onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Unidad actual</label>
          <p className="text-sm font-mono font-bold text-foreground">{unidad.nombre}</p>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Nueva unidad *</label>
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value.toUpperCase())}
            placeholder="Ej: PZA"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">Se normaliza a mayúsculas.</p>
        </div>
        {err && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">{err}</div>
        )}
      </div>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={renameMut.isPending}>Cancelar</Button>
        <Button size="sm" onClick={onSubmit} disabled={renameMut.isPending}>
          {renameMut.isPending ? 'Renombrando…' : 'Renombrar'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── UnidadesTab ─────────────────────────────────────────────────────────────

export function UnidadesTab() {
  const { data, isLoading } = useUnidades();
  const [modalRename, setModalRename] = useState<Unidad | null>(null);

  // GET /api/catalogos/unidades ahora devuelve directamente el arreglo del
  // catálogo `unidades_medida` (Task 4) — ya no { en_uso, sugeridas }. El
  // conteo de productos por unidad y la lista de "sugeridas" (derivados del
  // viejo diccionario distinct) no tienen equivalente en el nuevo shape.
  const unidades = data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{unidades.length} unidad(es)</p>

      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-3 text-left">Unidad</th>
            <th className="p-3 text-center">Abreviatura</th>
            <th className="p-3 text-center">Estado</th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={4}>Cargando unidades…</DataTableEmpty>
          )}
          {!isLoading && unidades.length === 0 && (
            <DataTableEmpty colSpan={4}>Sin unidades registradas</DataTableEmpty>
          )}
          {unidades.map((u) => (
            <DataTableRow key={u.id}>
              <td className="p-3 font-mono font-bold text-foreground">{u.nombre}</td>
              <td className="p-3 text-center">
                <Badge variant="cyan">{u.abreviatura}</Badge>
              </td>
              <td className="p-3 text-center">
                <Badge variant={u.activa ? 'cyan' : 'slate'}>{u.activa ? 'Activa' : 'Inactiva'}</Badge>
              </td>
              <td className="p-3 text-right">
                <button
                  onClick={() => setModalRename(u)}
                  title="Renombrar"
                  className="text-muted-foreground hover:text-foreground px-1"
                >
                  <Pen className="h-4 w-4 inline" />
                </button>
              </td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {modalRename && (
        <RenombrarModal
          unidad={modalRename}
          onClose={() => setModalRename(null)}
          onSaved={() => setModalRename(null)}
        />
      )}
    </div>
  );
}
