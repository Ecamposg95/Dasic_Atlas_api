import { useState, useMemo, useCallback } from 'react';
import { KanbanSquare, Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { useIsAdminOrGerente } from '@/lib/permissions';
import { useClientes } from '@/features/clientes/hooks/useClientes';
import { useUsuarios } from '@/features/usuarios/hooks/useUsuarios';
import type { Cliente } from '@/features/clientes/types';
import type { Usuario } from '@/features/usuarios/types';
import { QueryError } from '@/components/ui/query-error';
import { useCrmPipelines, useCrmBoard } from '../hooks/useCrmBoard';
import { useMoveDeal, useDeleteDeal } from '../hooks/useCrmDeals';
import { KanbanColumn } from '../components/KanbanColumn';
import { DealFormModal } from '../components/DealFormModal';
import { PipelineMetricasBar } from '../components/PipelineMetricasBar';
import { ConfigurarEtapasModal } from '../components/ConfigurarEtapasModal';
import type { Deal } from '../types';

export function CrmKanbanPage() {
  const { data: pipelines = [], isLoading: loadingPipelines, isError: errorPipelines,
          error: errPipelines, refetch: recargarPipelines } = useCrmPipelines();
  const isAdminOrGerente = useIsAdminOrGerente();

  // Derive default pipeline id once pipelines load.
  const defaultPipelineId = useMemo(() => {
    if (pipelines.length === 0) return null;
    const def = pipelines.find((p) => p.es_default);
    return (def ?? pipelines[0]).id;
  }, [pipelines]);

  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null);

  // Use the controlled selection if set, otherwise fall back to the default.
  const activePipelineId = selectedPipelineId ?? defaultPipelineId;

  const { data: board, isLoading: loadingBoard, isError: errorBoard,
          error: errBoard, refetch: recargarBoard } = useCrmBoard(activePipelineId);

  const { data: clientes = [] } = useClientes({ page: 1, q: '', pageSize: 500 });
  const { data: usuarios = [] } = useUsuarios();

  // Build lookup maps for O(1) access in DealCard.
  const clientesMap = useMemo(
    () => new Map<number, Cliente>(clientes.map((c) => [c.id, c])),
    [clientes],
  );
  const usuariosMap = useMemo(
    () => new Map<number, Usuario>(usuarios.map((u) => [u.id, u])),
    [usuarios],
  );

  const moveDeal = useMoveDeal(activePipelineId);
  const deleteDeal = useDeleteDeal();

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const activePipeline = useMemo(
    () => pipelines.find((p) => p.id === activePipelineId) ?? null,
    [pipelines, activePipelineId],
  );

  function openCreate() {
    setEditingDeal(null);
    setModalOpen(true);
  }

  function openEdit(deal: Deal) {
    setEditingDeal(deal);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingDeal(null);
  }

  const handleDrop = useCallback(
    (dealId: number, stageId: number) => {
      // Evita un /move espurio (y el parpadeo) si se suelta en la misma columna.
      const yaEnColumna = board?.deals_by_stage[String(stageId)]?.some((d) => d.id === dealId);
      if (yaEnColumna) return;
      moveDeal.mutate({ id: dealId, move: { stage_id: stageId } });
    },
    [moveDeal, board],
  );

  async function handleDelete(deal: Deal) {
    const ok = await confirm({
      titulo: 'Eliminar deal',
      mensaje: `¿Eliminar "${deal.titulo}"? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tono: 'danger',
    });
    if (!ok) return;

    deleteDeal.mutate(
      { id: deal.id, pipelineId: deal.pipeline_id },
      {
        onSuccess: () => toast({ kind: 'success', title: 'Deal eliminado' }),
      },
    );
  }

  // Sorted stages for this board.
  const stages = useMemo(
    () => [...(board?.stages ?? [])].sort((a, b) => a.orden - b.orden),
    [board],
  );

  if (errorPipelines) {
    // Sin pipelines no hay tablero que dibujar: el error va en lugar de la
    // página entera, no dentro de un tablero vacío.
    return <QueryError error={errPipelines} onRetry={() => void recargarPipelines()} />;
  }

  if (loadingPipelines) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Cargando pipelines…
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <KanbanSquare className="h-10 w-10 opacity-30" />
        <p className="text-sm">No hay pipelines configurados.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-border">
        <PageHeader
          className="mb-0"
          title={
            <span className="flex items-center gap-2">
              <KanbanSquare className="h-5 w-5 text-accent-glow shrink-0" />
              CRM · Pipeline
            </span>
          }
          actions={
            <>
              {/* Pipeline selector — only shown when >1 pipeline */}
              {pipelines.length > 1 && (
                <Select
                  value={activePipelineId != null ? String(activePipelineId) : ''}
                  onChange={(e) => setSelectedPipelineId(parseInt(e.target.value, 10))}
                  className="w-48 h-9 text-sm"
                >
                  {pipelines.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.nombre}
                    </option>
                  ))}
                </Select>
              )}

              {/* Configuración de etapas — solo admin/gerente */}
              {isAdminOrGerente && activePipeline != null && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfigOpen(true)}
                  aria-label="Configurar etapas"
                  title="Configurar etapas"
                  className="px-2.5"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}

              <Button size="sm" onClick={openCreate} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Nuevo deal
              </Button>
            </>
          }
        />
      </div>

      {/* Franja de métricas del pipeline (compacta, no roba altura al board) */}
      <PipelineMetricasBar pipelineId={activePipelineId} />

      {/* Board area — horizontal scroll */}
      <div className="flex-1 overflow-auto">
        {loadingBoard ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Cargando tablero…
          </div>
        ) : errorBoard ? (
          <QueryError error={errBoard} onRetry={() => void recargarBoard()} />
        ) : stages.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Este pipeline no tiene etapas configuradas.
          </div>
        ) : (
          <div className="flex gap-4 p-4 min-w-max">
            {stages.map((stage) => {
              // deals_by_stage keys are stringified stage ids.
              const deals = board?.deals_by_stage[String(stage.id)] ?? [];
              return (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  deals={deals}
                  clientesMap={clientesMap}
                  usuariosMap={usuariosMap}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onDrop={handleDrop}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Deal form modal */}
      {modalOpen && activePipelineId != null && (
        <DealFormModal
          pipelineId={activePipelineId}
          stages={stages}
          deal={editingDeal}
          onClose={closeModal}
        />
      )}

      {/* Configurar etapas (admin/gerente) */}
      {configOpen && activePipeline != null && (
        <ConfigurarEtapasModal
          pipeline={activePipeline}
          stages={stages}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  );
}
