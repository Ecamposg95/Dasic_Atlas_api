import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useCotizador } from '../store';
import { buildSavePayload, type CotizadorSnapshot } from '../lib/serialize';
import type { OrdenVentaDetail } from '../types';

export function useCotizacionLoader(id: number | null) {
  return useQuery<OrdenVentaDetail>({
    queryKey: ['orden', id],
    // El backend NO expone `GET /api/ventas/{id}` plano; el detalle completo
    // para el editor vive en `/detalle-json` (app/routers/ventas.py:1354).
    queryFn: () => api.get<OrdenVentaDetail>(`/api/ventas/${id}/detalle-json`),
    enabled: id != null,
    staleTime: 0,
  });
}

type SaveResult = { id: number; folio: string };
// `creada` distingue POST (orden nueva) de PUT (update): el vínculo con un
// deal del CRM solo aplica la primera vez que la orden nace.
type SaveOutcome = SaveResult & { creada: boolean };

export function useGuardarCotizacion() {
  const qc = useQueryClient();
  // Vínculo CRM→cotizador: si la página se abrió con ?deal_id=<id> (botón
  // "Crear cotización" del detalle de deal), al CREAR la orden se hace PATCH
  // del deal con orden_id y se limpia el param para no re-vincular después.
  const [params, setParams] = useSearchParams();
  const dealIdParam = params.get('deal_id');

  return useMutation<SaveOutcome, { status?: number; detail?: string }, CotizadorSnapshot>({
    mutationFn: async (snapshot) => {
      const payload = buildSavePayload(snapshot);
      // Leer editingId del store EN EL MOMENTO del mutate (no de un closure a
      // nivel de hook). Tras un POST, `onGuardarQuedarse` llama setEditing(id)
      // y dispara un 2º guardado en el mismo render: con getState() ese 2º
      // save usa PUT con el id recién creado en vez de POST → no duplica.
      const editingId = useCotizador.getState().editingId;
      if (editingId != null) {
        const r = await api.put<SaveResult>(`/api/ventas/${editingId}`, payload);
        return { ...r, creada: false };
      }
      const r = await api.post<SaveResult>('/api/ventas/', payload);
      return { ...r, creada: true };
    },
    onSuccess: async (data) => {
      // Invalidar la lista de seguimiento si existe en cache
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['orden', data.id] });

      const dealId = dealIdParam ? parseInt(dealIdParam, 10) : NaN;
      if (data.creada && Number.isFinite(dealId)) {
        // `await` intencional: react-query espera este onSuccess antes de
        // correr los callbacks del mutate() — así el PATCH termina antes de
        // que "Guardar e ir a Seguimiento" navegue con window.location (una
        // navegación dura abortaría un fetch en vuelo). El error NO bloquea
        // el flujo del cotizador: solo toast.
        try {
          await api.patch(`/api/crm/deals/${dealId}`, { orden_id: data.id });
          toast({ kind: 'success', title: 'Cotización vinculada al deal' });
          qc.invalidateQueries({ queryKey: ['crm', 'deal', dealId] });
          qc.invalidateQueries({ queryKey: ['crm', 'board'] });
        } catch (e) {
          toast({
            kind: 'error',
            title: 'No se pudo vincular la cotización al deal',
            description: (e as { detail?: string }).detail,
          });
        }
        // Limpiar deal_id de la URL (replace) para no re-vincular en
        // guardados posteriores. cliente_id puede quedarse: el prefill
        // solo corre al montar.
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('deal_id');
            return next;
          },
          { replace: true },
        );
      }
    },
  });
}
