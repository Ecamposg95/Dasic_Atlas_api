import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pen, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useUnidades } from '../hooks/useUnidades';
import type { Unidad } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function ModalShell({
  title, children, onClose,
}: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
  const [nuevo, setNuevo] = useState(unidad.unidad);
  const [err, setErr] = useState<string | null>(null);

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
    if (nuevoTrim === unidad.unidad) { onClose(); return; }
    renameMut.mutate({ antiguo: unidad.unidad, nuevo: nuevoTrim });
  }

  return (
    <ModalShell title="Renombrar unidad" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Unidad actual</label>
          <p className="text-sm font-mono font-bold text-foreground">{unidad.unidad}</p>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Nueva unidad *</label>
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value.toUpperCase())}
            placeholder="Ej: PZA"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">
            Se actualizarán {unidad.n_productos} producto(s). Se normaliza a mayúsculas.
          </p>
        </div>
        {err && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">{err}</div>
        )}
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={renameMut.isPending}>Cancelar</Button>
          <Button size="sm" onClick={onSubmit} disabled={renameMut.isPending}>
            {renameMut.isPending ? 'Renombrando…' : 'Renombrar'}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── UnidadesTab ─────────────────────────────────────────────────────────────

export function UnidadesTab() {
  const { data, isLoading } = useUnidades();
  const [modalRename, setModalRename] = useState<Unidad | null>(null);

  const enUso = data?.en_uso ?? [];
  const sugeridas = data?.sugeridas ?? [];

  // Sugeridas que aún no están en uso
  const sugieridasNoEnUso = sugeridas.filter(
    (s) => !enUso.some((u) => u.unidad === s),
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{enUso.length} unidad(es) en uso</p>

      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-3 text-left">Unidad</th>
            <th className="p-3 text-center"># Productos</th>
            <th className="p-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={3}>Cargando unidades…</DataTableEmpty>
          )}
          {!isLoading && enUso.length === 0 && (
            <DataTableEmpty colSpan={3}>Sin unidades en uso</DataTableEmpty>
          )}
          {enUso.map((u) => (
            <DataTableRow key={u.unidad}>
              <td className="p-3 font-mono font-bold text-foreground">{u.unidad}</td>
              <td className="p-3 text-center">
                <Badge variant={u.n_productos > 0 ? 'cyan' : 'slate'}>{u.n_productos}</Badge>
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

      {sugieridasNoEnUso.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Sugeridas (aún no en uso):</p>
          <div className="flex flex-wrap gap-1.5">
            {sugieridasNoEnUso.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded border border-border-strong font-mono text-xs text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

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
