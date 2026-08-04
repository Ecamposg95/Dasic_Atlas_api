import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PipelineMetricas } from '../types';

// Métricas agregadas del pipeline (abiertos / ganados / perdidos / tasa).
// Key: ['crm', 'metricas', pipelineId, dias] — las mutaciones de stages/deals
// invalidan el prefijo ['crm', 'metricas', pipelineId].
export function useMetricasPipeline(pipelineId: number | null, dias: number) {
  return useQuery<PipelineMetricas>({
    queryKey: ['crm', 'metricas', pipelineId, dias],
    queryFn: () =>
      api.get<PipelineMetricas>(`/api/crm/pipelines/${pipelineId}/metricas?dias=${dias}`),
    enabled: pipelineId != null,
    staleTime: 30_000,
  });
}
