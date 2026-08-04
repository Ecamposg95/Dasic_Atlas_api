import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { confirm } from '@/lib/confirm';
import { Pen, Trash2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalFooter } from '@/components/ui/modal';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useMarcas } from '../hooks/useMarcas';
import type { Marca, MarcaCreate, MarcaUpdate } from '../types';

// ─── MarcaFormModal (crear y editar) ────────────────────────────────────────

function MarcaFormModal({
  marca,
  onClose,
  onSaved,
}: {
  marca: Marca | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = marca != null;
  const qc = useQueryClient();

  const [abreviatura, setAbreviatura] = useState(marca?.abreviatura ?? '');
  const [nombre, setNombre] = useState(marca?.nombre ?? '');
  const [categoria, setCategoria] = useState(marca?.categoria ?? '');
  const [err, setErr] = useState<string | null>(null);

  const crearMut = useMutation<Marca, { status?: number; detail?: string }, MarcaCreate>({
    mutationFn: (payload) => api.post<Marca>('/api/catalogos/marcas', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'marcas'] });
      toast({ kind: 'success', title: 'Marca creada' });
      onSaved();
    },
    onError: (e) => {
      if (e.status === 409) setErr(e.detail ?? 'La abreviatura ya existe.');
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso', description: 'Necesitas rol admin/asistente.' });
      else setErr(e.detail ?? 'No se pudo crear la marca.');
    },
  });

  const editarMut = useMutation<Marca, { status?: number; detail?: string }, { abrev: string; payload: MarcaUpdate }>({
    mutationFn: ({ abrev, payload }) => api.put<Marca>(`/api/catalogos/marcas/${abrev}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'marcas'] });
      toast({ kind: 'success', title: 'Marca actualizada' });
      onSaved();
    },
    onError: (e) => {
      if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else setErr(e.detail ?? 'No se pudo actualizar la marca.');
    },
  });

  const busy = crearMut.isPending || editarMut.isPending;

  function onSubmit() {
    setErr(null);
    const nombreTrim = nombre.trim();
    if (!nombreTrim || nombreTrim.length < 2) {
      setErr('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (!isEdit) {
      const abrevTrim = abreviatura.trim();
      if (!abrevTrim || abrevTrim.length < 2) {
        setErr('La abreviatura debe tener al menos 2 caracteres.');
        return;
      }
      crearMut.mutate({
        abreviatura: abrevTrim,
        nombre: nombreTrim,
        categoria: categoria.trim() || undefined,
      });
    } else {
      editarMut.mutate({
        abrev: marca.abreviatura,
        payload: {
          nombre: nombreTrim,
          categoria: categoria.trim() || undefined,
        },
      });
    }
  }

  return (
    <Modal title={isEdit ? 'Editar marca' : 'Nueva marca'} onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Abreviatura *</label>
          <Input
            value={abreviatura}
            onChange={(e) => setAbreviatura(e.target.value)}
            placeholder="Ej: SCH"
            disabled={isEdit}
            className={isEdit ? 'opacity-60 cursor-not-allowed' : ''}
          />
          {!isEdit && (
            <p className="text-xs text-muted-foreground mt-1">2-20 chars alfanuméricos. Se normaliza a mayúsculas.</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Nombre *</label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Schneider Electric"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Categoría</label>
          <Input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Ej: Automatización"
          />
        </div>
        {err && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">{err}</div>
        )}
      </div>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button size="sm" onClick={onSubmit} disabled={busy}>
          {busy ? 'Guardando…' : (isEdit ? 'Guardar' : 'Crear')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── MarcasTab ──────────────────────────────────────────────────────────────

export function MarcasTab() {
  const { data: marcas, isLoading } = useMarcas();
  const qc = useQueryClient();
  const [modalMarca, setModalMarca] = useState<Marca | 'nueva' | null>(null);

  const eliminarMut = useMutation<unknown, { status?: number; detail?: string }, string>({
    mutationFn: (abrev) => api.delete(`/api/catalogos/marcas/${abrev}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'marcas'] });
      toast({ kind: 'success', title: 'Marca eliminada' });
    },
    onError: (e) => {
      if (e.status === 409) toast({ kind: 'error', title: 'No se puede eliminar', description: e.detail });
      else if (e.status === 403) toast({ kind: 'error', title: 'Sin permiso' });
      else toast({ kind: 'error', title: 'Error al eliminar', description: e.detail });
    },
  });

  async function onEliminar(m: Marca) {
    if (m.n_productos > 0) {
      toast({
        kind: 'warning',
        title: 'Marca en uso',
        description: `Tiene ${m.n_productos} producto(s). Reasígnalos antes de eliminar.`,
      });
      return;
    }
    if (await confirm({ mensaje: `¿Eliminar la marca "${m.nombre}" (${m.abreviatura})?`, tono: 'danger' })) {
      eliminarMut.mutate(m.abreviatura);
    }
  }

  const lista = marcas ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{lista.length} marca(s)</p>
        <Button size="sm" onClick={() => setModalMarca('nueva')}>
          <Plus className="h-4 w-4 mr-1" /> Nueva marca
        </Button>
      </div>

      <DataTable maxBodyHeight="calc(100vh - 20rem)">
        <DataTableHead sticky>
          <tr>
            <th className="p-3 text-left">Abreviatura</th>
            <th className="p-3 text-left">Nombre</th>
            <th className="p-3 text-left">Categoría</th>
            <th className="p-3 text-center"># Productos</th>
            <th className="p-3 text-left">Próximo SKU</th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={6}>Cargando marcas…</DataTableEmpty>
          )}
          {!isLoading && lista.length === 0 && (
            <DataTableEmpty colSpan={6}>Sin marcas registradas</DataTableEmpty>
          )}
          {lista.map((m) => (
            <DataTableRow key={m.id}>
              <td className="p-3">
                <span className="font-mono font-bold text-foreground">{m.abreviatura}</span>
              </td>
              <td className="p-3 text-foreground">{m.nombre}</td>
              <td className="p-3 text-muted-foreground text-sm">{m.categoria || <span className="text-muted-foreground/70">—</span>}</td>
              <td className="p-3 text-center">
                <Badge variant={m.n_productos > 0 ? 'cyan' : 'slate'}>{m.n_productos}</Badge>
              </td>
              <td className="p-3 font-mono text-xs text-muted-foreground">{m.siguiente_sku ?? '—'}</td>
              <td className="p-3 text-right whitespace-nowrap">
                <button
                  onClick={() => setModalMarca(m)}
                  title="Editar"
                  className="text-muted-foreground hover:text-foreground px-1"
                >
                  <Pen className="h-4 w-4 inline" />
                </button>
                <button
                  onClick={() => onEliminar(m)}
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

      {modalMarca != null && (
        <MarcaFormModal
          marca={modalMarca === 'nueva' ? null : modalMarca}
          onClose={() => setModalMarca(null)}
          onSaved={() => setModalMarca(null)}
        />
      )}
    </div>
  );
}
