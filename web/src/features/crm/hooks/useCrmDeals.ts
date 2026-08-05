import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { normalizeDetail } from '@/lib/api';
import type { Deal, DealCreate, DealMove, DealUpdate, Board } from '../types';

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DealCreate) => api.post<Deal>('/api/crm/deals', payload),
    onSuccess: (deal) => {
      void qc.invalidateQueries({ queryKey: ['crm', 'board', deal.pipeline_id] });
      void qc.invalidateQueries({ queryKey: ['crm', 'metricas', deal.pipeline_id] });
      // La ficha de la empresa tiene su propia pestaña de deals
      // (`['empresa', id, 'deals']`, en useEmpresa360). Sin esto, crear o
      // editar un deal desde el Kanban dejaba esa pestaña con la lista vieja.
      if (deal.cliente_id != null) {
        void qc.invalidateQueries({ queryKey: ['empresa', deal.cliente_id, 'deals'] });
      }
    },
    onError: (err: unknown) => {
      const detail = (err as { detail?: unknown })?.detail;
      toast({ kind: 'error', title: 'Error al crear deal', description: normalizeDetail(detail, 'Error desconocido') });
    },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: DealUpdate }) =>
      api.patch<Deal>(`/api/crm/deals/${id}`, payload),
    onSuccess: (deal) => {
      void qc.invalidateQueries({ queryKey: ['crm', 'board', deal.pipeline_id] });
      void qc.invalidateQueries({ queryKey: ['crm', 'metricas', deal.pipeline_id] });
      // La ficha de la empresa tiene su propia pestaña de deals
      // (`['empresa', id, 'deals']`, en useEmpresa360). Sin esto, crear o
      // editar un deal desde el Kanban dejaba esa pestaña con la lista vieja.
      if (deal.cliente_id != null) {
        void qc.invalidateQueries({ queryKey: ['empresa', deal.cliente_id, 'deals'] });
      }
    },
    onError: (err: unknown) => {
      const detail = (err as { detail?: unknown })?.detail;
      toast({ kind: 'error', title: 'Error al actualizar deal', description: normalizeDetail(detail, 'Error desconocido') });
    },
  });
}

// Optimistic move: instantly re-order deals_by_stage in the cache, rollback on error.
export function useMoveDeal(pipelineId: number | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, move }: { id: number; move: DealMove }) =>
      api.patch<Deal>(`/api/crm/deals/${id}/move`, move),

    onMutate: async ({ id, move }) => {
      if (pipelineId == null) return;

      const queryKey = ['crm', 'board', pipelineId];
      // Cancel in-flight queries so they don't overwrite our optimistic update.
      await qc.cancelQueries({ queryKey });

      // Snapshot the board for rollback.
      const snapshot = qc.getQueryData<Board>(queryKey);

      // Apply optimistic update.
      qc.setQueryData<Board>(queryKey, (old) => {
        if (!old) return old;

        const newDbs: Record<string, Deal[]> = {};
        // Deep-copy deals_by_stage.
        for (const [k, v] of Object.entries(old.deals_by_stage)) {
          newDbs[k] = [...v];
        }

        // Find deal in its current stage and remove it.
        let movingDeal: Deal | undefined;
        for (const stageKey of Object.keys(newDbs)) {
          const idx = newDbs[stageKey].findIndex((d) => d.id === id);
          if (idx !== -1) {
            [movingDeal] = newDbs[stageKey].splice(idx, 1);
            break;
          }
        }
        if (!movingDeal) return old;

        // Update stage on the deal.
        const updatedDeal: Deal = { ...movingDeal, stage_id: move.stage_id };

        // Insert into destination stage; keys are stringified stage ids.
        const destKey = String(move.stage_id);
        if (!newDbs[destKey]) newDbs[destKey] = [];
        const insertAt = move.orden_en_stage ?? newDbs[destKey].length;
        newDbs[destKey].splice(insertAt, 0, updatedDeal);

        return { ...old, deals_by_stage: newDbs };
      });

      return { snapshot, queryKey };
    },

    onError: (_err, _vars, ctx) => {
      // Rollback to snapshot.
      if (ctx && 'snapshot' in ctx && ctx.snapshot) {
        qc.setQueryData(ctx.queryKey as string[], ctx.snapshot);
      }
      toast({ kind: 'error', title: 'No se pudo mover el deal', description: 'Se revirtió el cambio.' });
    },

    onSettled: () => {
      if (pipelineId != null) {
        void qc.invalidateQueries({ queryKey: ['crm', 'board', pipelineId] });
        void qc.invalidateQueries({ queryKey: ['crm', 'metricas', pipelineId] });
      }
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pipelineId }: { id: number; pipelineId: number }) =>
      api.delete<void>(`/api/crm/deals/${id}`).then(() => ({ pipelineId })),
    onSuccess: ({ pipelineId }) => {
      void qc.invalidateQueries({ queryKey: ['crm', 'board', pipelineId] });
      void qc.invalidateQueries({ queryKey: ['crm', 'metricas', pipelineId] });
    },
    onError: (err: unknown) => {
      const detail = (err as { detail?: unknown })?.detail;
      toast({ kind: 'error', title: 'Error al eliminar deal', description: normalizeDetail(detail, 'Error desconocido') });
    },
  });
}
