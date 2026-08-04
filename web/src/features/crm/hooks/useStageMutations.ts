import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, normalizeDetail } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Pipeline, Stage, StageCreate, StageUpdate } from '../types';

// Mutaciones de configuración de etapas / pipeline (CRM v2).
// Toda mutación invalida board + pipelines + métricas del pipeline afectado.

function invalidatePipelineData(qc: QueryClient, pipelineId: number) {
  void qc.invalidateQueries({ queryKey: ['crm', 'board', pipelineId] });
  void qc.invalidateQueries({ queryKey: ['crm', 'pipelines'] });
  void qc.invalidateQueries({ queryKey: ['crm', 'metricas', pipelineId] });
}

function errorToast(title: string) {
  return (err: unknown) => {
    const detail = (err as { detail?: unknown })?.detail;
    toast({ kind: 'error', title, description: normalizeDetail(detail, 'Error desconocido') });
  };
}

export function useCreateStage(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: StageCreate) =>
      api.post<Stage>(`/api/crm/pipelines/${pipelineId}/stages`, payload),
    onSuccess: () => invalidatePipelineData(qc, pipelineId),
    onError: errorToast('Error al crear etapa'),
  });
}

export function useUpdateStage(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, payload }: { stageId: number; payload: StageUpdate }) =>
      api.patch<Stage>(`/api/crm/stages/${stageId}`, payload),
    onSuccess: () => invalidatePipelineData(qc, pipelineId),
    onError: errorToast('Error al actualizar etapa'),
  });
}

// El backend responde 409 si la etapa tiene deals o es de cierre —
// el mensaje llega en `detail` y se muestra tal cual en el toast.
export function useDeleteStage(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stageId: number) => api.delete<void>(`/api/crm/stages/${stageId}`),
    onSuccess: () => invalidatePipelineData(qc, pipelineId),
    onError: errorToast('No se pudo eliminar la etapa'),
  });
}

export function useReorderStages(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stageIds: number[]) =>
      api.post<void>(`/api/crm/pipelines/${pipelineId}/stages/reorder`, { stage_ids: stageIds }),
    onSuccess: () => invalidatePipelineData(qc, pipelineId),
    onError: errorToast('Error al reordenar etapas'),
  });
}

export function useRenamePipeline(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nombre: string) =>
      api.patch<Pipeline>(`/api/crm/pipelines/${pipelineId}`, { nombre }),
    onSuccess: () => invalidatePipelineData(qc, pipelineId),
    onError: errorToast('Error al renombrar pipeline'),
  });
}
