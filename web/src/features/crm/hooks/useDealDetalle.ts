import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, normalizeDetail } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Actividad, ActividadCreate, Deal, DealDetalle, DealUpdate } from '../types';

// Detalle de un deal (incluye actividades). Key: ['crm', 'deal', id].
export function useDealDetalle(dealId: number | null) {
  return useQuery<DealDetalle>({
    queryKey: ['crm', 'deal', dealId],
    queryFn: () => api.get<DealDetalle>(`/api/crm/deals/${dealId}`),
    enabled: dealId != null && dealId > 0,
  });
}

// Registrar actividad (nota/llamada/email/reunion/visita) sobre un deal.
export function useCrearActividad(dealId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ActividadCreate) =>
      api.post<Actividad>(`/api/crm/deals/${dealId}/actividades`, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm', 'deal', dealId] });
    },
    onError: (err: unknown) => {
      const detail = (err as { detail?: unknown })?.detail;
      toast({
        kind: 'error',
        title: 'Error al registrar actividad',
        description: normalizeDetail(detail, 'Error desconocido'),
      });
    },
  });
}

// PATCH del deal desde la vista de detalle: invalida detalle Y board.
export function usePatchDealDetalle(dealId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DealUpdate) => api.patch<Deal>(`/api/crm/deals/${dealId}`, payload),
    onSuccess: (deal) => {
      void qc.invalidateQueries({ queryKey: ['crm', 'deal', dealId] });
      void qc.invalidateQueries({ queryKey: ['crm', 'board', deal.pipeline_id] });
      void qc.invalidateQueries({ queryKey: ['crm', 'metricas', deal.pipeline_id] });
    },
    onError: (err: unknown) => {
      const detail = (err as { detail?: unknown })?.detail;
      toast({
        kind: 'error',
        title: 'Error al guardar cambios',
        description: normalizeDetail(detail, 'Error desconocido'),
      });
    },
  });
}
