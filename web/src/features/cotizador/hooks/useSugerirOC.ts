import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ApiError } from '@/lib/api';
import type { GenerarOCResponse, SugerirOCResponse } from '../types';

export function useSugerirOC() {
  return useMutation<SugerirOCResponse, ApiError, number>({
    mutationFn: (cotizacionId) =>
      api.post<SugerirOCResponse>(`/api/ventas/${cotizacionId}/sugerir-oc`),
  });
}

// El endpoint `/generar-oc` no acepta payload — siempre genera todas las
// OCs sugeridas por `previsualizar_ocs`. Por eso `mutationFn` sólo recibe el id.
export function useGenerarOC() {
  const qc = useQueryClient();
  return useMutation<GenerarOCResponse, ApiError, number>({
    mutationFn: (cotizacionId) =>
      api.post<GenerarOCResponse>(`/api/ventas/${cotizacionId}/generar-oc`),
    onSuccess: () => {
      // La clave del listado de OCs es ['ordenesCompra'] (useOrdenesCompra):
      // ['compras'] no existe como query en ninguna parte, así que invalidarla
      // no refrescaba nada y las OCs recién generadas no aparecían.
      qc.invalidateQueries({ queryKey: ['ordenesCompra'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
    },
  });
}
