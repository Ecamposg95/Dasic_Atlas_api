import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import {
  useCreateStage,
  useDeleteStage,
  useRenamePipeline,
  useReorderStages,
  useUpdateStage,
} from '../hooks/useStageMutations';
import { STAGE_PALETTE } from '../stageColors';
import type { Pipeline, Stage } from '../types';

// Modal de configuración de etapas del pipeline (solo admin/gerente):
// renombrar pipeline, reordenar (↑↓), rename inline, color (paleta fija),
// agregar y eliminar etapas. Las etapas de cierre (ganado/perdido) se
// etiquetan y no se pueden borrar.

type Props = {
  pipeline: Pipeline;
  /** Etapas YA ordenadas por `orden`. */
  stages: Stage[];
  onClose: () => void;
};

function StageRow({
  stage,
  index,
  total,
  reorderPending,
  paletteOpen,
  onTogglePalette,
  onMove,
  onRename,
  onColor,
  onDelete,
}: {
  stage: Stage;
  index: number;
  total: number;
  reorderPending: boolean;
  paletteOpen: boolean;
  onTogglePalette: () => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRename: (stage: Stage, nombre: string) => void;
  onColor: (stage: Stage, hex: string) => void;
  onDelete: (stage: Stage) => void;
}) {
  const [nombre, setNombre] = useState(stage.nombre);

  // Re-sincroniza si el server devuelve otro nombre (p.ej. tras invalidación).
  useEffect(() => {
    setNombre(stage.nombre);
  }, [stage.nombre]);

  const esCierre = stage.es_ganado || stage.es_perdido;

  function commitNombre() {
    const limpio = nombre.trim();
    if (!limpio || limpio === stage.nombre) {
      setNombre(stage.nombre);
      return;
    }
    onRename(stage, limpio);
  }

  return (
    <li className="rounded-lg border border-border bg-surface-2/40 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        {/* Reordenar */}
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0 || reorderPending}
            aria-label={`Subir etapa ${stage.nombre}`}
            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1 || reorderPending}
            aria-label={`Bajar etapa ${stage.nombre}`}
            className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Color actual → abre/cierra la paleta */}
        <button
          type="button"
          onClick={onTogglePalette}
          aria-label={`Color de la etapa ${stage.nombre}`}
          aria-expanded={paletteOpen}
          className={cn(
            'h-5 w-5 shrink-0 rounded-full border border-border-strong transition-shadow',
            paletteOpen && 'ring-2 ring-accent-glow ring-offset-1 ring-offset-card',
          )}
          style={{ backgroundColor: stage.color?.startsWith('#') ? stage.color : '#6b7280' }}
        />

        {/* Rename inline: guarda al blur o con Enter */}
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={commitNombre}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setNombre(stage.nombre);
          }}
          aria-label={`Nombre de la etapa ${stage.nombre}`}
          className="h-8 flex-1 min-w-0 text-sm"
        />

        {/* Cierre (no borrable) o eliminar */}
        {esCierre ? (
          <Badge variant={stage.es_ganado ? 'emerald' : 'rose'} className="shrink-0">
            Cierre · {stage.es_ganado ? 'Ganado' : 'Perdido'}
          </Badge>
        ) : (
          <button
            type="button"
            onClick={() => onDelete(stage)}
            aria-label={`Eliminar etapa ${stage.nombre}`}
            className="p-1.5 shrink-0 text-muted-foreground hover:text-rose-500 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Paleta de 8 swatches */}
      {paletteOpen && (
        <div className="mt-2 flex items-center gap-2 pl-7">
          {STAGE_PALETTE.map((c) => {
            const activo = (stage.color ?? '').toLowerCase() === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                title={c.nombre}
                aria-label={`Color ${c.nombre}`}
                aria-pressed={activo}
                onClick={() => onColor(stage, c.hex)}
                className={cn(
                  'h-6 w-6 rounded-full border border-border-strong transition-transform hover:scale-110',
                  activo && 'ring-2 ring-accent-glow ring-offset-1 ring-offset-card',
                )}
                style={{ backgroundColor: c.hex }}
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

export function ConfigurarEtapasModal({ pipeline, stages, onClose }: Props) {
  const createStage = useCreateStage(pipeline.id);
  const updateStage = useUpdateStage(pipeline.id);
  const deleteStage = useDeleteStage(pipeline.id);
  const reorderStages = useReorderStages(pipeline.id);
  const renamePipeline = useRenamePipeline(pipeline.id);

  const [nombrePipeline, setNombrePipeline] = useState(pipeline.nombre);
  const [nuevaEtapa, setNuevaEtapa] = useState('');
  const [paletteFor, setPaletteFor] = useState<number | null>(null);

  useEffect(() => {
    setNombrePipeline(pipeline.nombre);
  }, [pipeline.nombre]);

  function commitNombrePipeline() {
    const limpio = nombrePipeline.trim();
    if (!limpio || limpio === pipeline.nombre) {
      setNombrePipeline(pipeline.nombre);
      return;
    }
    renamePipeline.mutate(limpio);
  }

  function handleMove(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= stages.length) return;
    const ids = stages.map((s) => s.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorderStages.mutate(ids);
  }

  function handleRename(stage: Stage, nombre: string) {
    updateStage.mutate({ stageId: stage.id, payload: { nombre } });
  }

  function handleColor(stage: Stage, hex: string) {
    updateStage.mutate(
      { stageId: stage.id, payload: { color: hex } },
      { onSuccess: () => setPaletteFor(null) },
    );
  }

  async function handleDelete(stage: Stage) {
    const ok = await confirm({
      titulo: 'Eliminar etapa',
      mensaje: `¿Eliminar la etapa "${stage.nombre}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tono: 'danger',
    });
    if (!ok) return;
    // Si tiene deals o es de cierre, el backend responde 409 y el hook
    // muestra el mensaje del `detail` en un toast.
    deleteStage.mutate(stage.id, {
      onSuccess: () => toast({ kind: 'success', title: 'Etapa eliminada' }),
    });
  }

  function handleAgregar(e: React.FormEvent) {
    e.preventDefault();
    const nombre = nuevaEtapa.trim();
    if (!nombre) return;
    createStage.mutate(
      { nombre },
      {
        onSuccess: () => {
          setNuevaEtapa('');
          toast({ kind: 'success', title: 'Etapa agregada' });
        },
      },
    );
  }

  return (
    <Modal title="Configurar etapas" onClose={onClose} size="md">
      <div className="space-y-4">
        <FormField label="Nombre del pipeline" hint="Se guarda al salir del campo.">
          <Input
            value={nombrePipeline}
            onChange={(e) => setNombrePipeline(e.target.value)}
            onBlur={commitNombrePipeline}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setNombrePipeline(pipeline.nombre);
            }}
            disabled={renamePipeline.isPending}
            className="h-9 text-sm"
          />
        </FormField>

        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Etapas</p>
          {stages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Este pipeline no tiene etapas. Agrega la primera abajo.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {stages.map((stage, i) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  index={i}
                  total={stages.length}
                  reorderPending={reorderStages.isPending}
                  paletteOpen={paletteFor === stage.id}
                  onTogglePalette={() =>
                    setPaletteFor((prev) => (prev === stage.id ? null : stage.id))
                  }
                  onMove={handleMove}
                  onRename={handleRename}
                  onColor={handleColor}
                  onDelete={handleDelete}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Agregar etapa */}
        <form onSubmit={handleAgregar} className="flex items-center gap-2 border-t border-border pt-3">
          <Input
            value={nuevaEtapa}
            onChange={(e) => setNuevaEtapa(e.target.value)}
            placeholder="Nueva etapa…"
            aria-label="Nombre de la nueva etapa"
            className="h-9 flex-1 text-sm"
            disabled={createStage.isPending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={createStage.isPending || !nuevaEtapa.trim()}
            className="gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </form>
      </div>
    </Modal>
  );
}
