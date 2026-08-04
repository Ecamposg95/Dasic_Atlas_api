import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { confirm } from '@/lib/confirm';
import { Pen, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalFooter } from '@/components/ui/modal';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useCategorias } from '../hooks/useCategorias';
import type { Categoria } from '../types';

// ─── RenombrarModal ──────────────────────────────────────────────────────────

function RenombrarModal({
  categoria,
  onClose,
  onSaved,
}: {
  categoria: Categoria;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState(categoria.categoria);
  const [err, setErr] = useState<string | null>(null);

  const renameMut = useMutation<unknown, { status?: number; detail?: string }, { antiguo: string; nuevo: string }>({
    mutationFn: (payload) => api.put('/api/catalogos/categorias-producto/rename', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'categorias-producto'] });
      toast({ kind: 'success', title: 'Categoría renombrada' });
      onSaved();
    },
    onError: (e) => {
      if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else setErr(e.detail ?? 'No se pudo renombrar.');
    },
  });

  function onSubmit() {
    setErr(null);
    const nuevoTrim = nuevo.trim();
    if (!nuevoTrim) { setErr('El nombre no puede estar vacío.'); return; }
    if (nuevoTrim === categoria.categoria) { onClose(); return; }
    renameMut.mutate({ antiguo: categoria.categoria, nuevo: nuevoTrim });
  }

  return (
    <Modal title="Renombrar categoría" onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Nombre actual</label>
          <p className="text-sm font-medium text-foreground">{categoria.categoria}</p>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Nuevo nombre *</label>
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Ej: Relés"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">
            Se actualizarán {categoria.n_productos} producto(s).
          </p>
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

// ─── CategoriasTab ───────────────────────────────────────────────────────────

export function CategoriasTab() {
  const { data, isLoading } = useCategorias();
  const qc = useQueryClient();
  const [modalRename, setModalRename] = useState<Categoria | null>(null);

  const eliminarMut = useMutation<unknown, { status?: number; detail?: string }, string>({
    mutationFn: (nombre) => api.delete(`/api/catalogos/categorias-producto/${encodeURIComponent(nombre)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'categorias-producto'] });
      toast({ kind: 'success', title: 'Categoría eliminada', description: 'Los productos quedaron sin categoría.' });
    },
    onError: (e) => {
      if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else toast({ kind: 'error', title: 'Error al eliminar', description: e.detail });
    },
  });

  async function onEliminar(c: Categoria) {
    if (c.n_productos > 0) {
      if (!(await confirm({
        mensaje: `¿Eliminar la categoría "${c.categoria}"?\n\nEsto quitará la categoría a ${c.n_productos} producto(s).`,
        tono: 'danger',
      }))) return;
    } else if (!(await confirm({ mensaje: `¿Eliminar la categoría "${c.categoria}"?`, tono: 'danger' }))) {
      return;
    }
    eliminarMut.mutate(c.categoria);
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{items.length} categoría(s) de producto en uso</p>

      <DataTable maxBodyHeight="24rem">
        <DataTableHead sticky>
          <tr>
            <th className="p-3 text-left">Nombre</th>
            <th className="p-3 text-center"># Productos</th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={3}>Cargando categorías…</DataTableEmpty>
          )}
          {!isLoading && items.length === 0 && (
            <DataTableEmpty colSpan={3}>Sin categorías registradas</DataTableEmpty>
          )}
          {items.map((c) => (
            <DataTableRow key={c.categoria}>
              <td className="p-3 text-foreground">{c.categoria}</td>
              <td className="p-3 text-center">
                <Badge variant={c.n_productos > 0 ? 'cyan' : 'slate'}>{c.n_productos}</Badge>
              </td>
              <td className="p-3 text-right whitespace-nowrap">
                <button
                  onClick={() => setModalRename(c)}
                  title="Renombrar"
                  className="text-muted-foreground hover:text-foreground px-1"
                >
                  <Pen className="h-4 w-4 inline" />
                </button>
                <button
                  onClick={() => onEliminar(c)}
                  title="Eliminar"
                  className="text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 px-1 disabled:opacity-40"
                  disabled={eliminarMut.isPending}
                >
                  <Trash2 className="h-4 w-4 inline" />
                </button>
              </td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {modalRename && (
        <RenombrarModal
          categoria={modalRename}
          onClose={() => setModalRename(null)}
          onSaved={() => setModalRename(null)}
        />
      )}
    </div>
  );
}
