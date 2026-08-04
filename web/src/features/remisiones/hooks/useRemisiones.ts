import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, normalizeDetail } from '@/lib/api';
import type {
  RemisionEstado,
  RemisionDetalle,
  RemisionesResponse,
  RemisionEstadoResponse,
  RemisionEmitirResponse,
  RecepcionResponse,
  RemisionCrearCotizacionResponse,
  RemisionBorrador,
  RemisionCreatePayload,
  RemisionUpdatePayload,
  RemisionCancelarPayload,
  OrdenHistorialItem,
  AvanceEntregaResponse,
  EmitirErrorDetail,
  RemisionEmitirError,
} from '../types';

// Nota general de errores: ninguna de estas mutaciones atrapa el rechazo del
// `api.*` — `useMutation` deja el error en `mutation.error`/`isError` (y en
// el callback `onError` que reciba `mutate(...)`) para que el call-site lo
// muestre (toast). No hay try/catch aquí que lo trague: el patrón del repo
// post-"refetch silencioso" exige que un fallo de mutación siempre sea
// visible, nunca una recarga silenciosa que deja al usuario sin feedback.

export type RemisionesFiltro = {
  estado?: RemisionEstado;
  ordenVentaId?: number;
  desde?: string;
  hasta?: string;
  creadoPorId?: number;
};

export function useRemisiones(page: number, q = '', filtro: RemisionesFiltro = {}) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', '50');
  if (q.trim()) params.set('q', q.trim());
  if (filtro.estado) params.set('estado', filtro.estado);
  if (filtro.ordenVentaId != null) params.set('orden_venta_id', String(filtro.ordenVentaId));
  if (filtro.desde) params.set('desde', filtro.desde);
  if (filtro.hasta) params.set('hasta', filtro.hasta);
  if (filtro.creadoPorId != null) params.set('creado_por_id', String(filtro.creadoPorId));
  return useQuery({
    queryKey: [
      'remisiones',
      page,
      q.trim(),
      filtro.estado,
      filtro.ordenVentaId,
      filtro.desde,
      filtro.hasta,
      filtro.creadoPorId,
    ],
    queryFn: () =>
      api.get<RemisionesResponse>(`/api/remisiones/?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useRemisionDetalle(id: number | null) {
  return useQuery({
    queryKey: ['remision', id],
    queryFn: () => api.get<RemisionDetalle>(`/api/remisiones/${id}`),
    enabled: id !== null,
  });
}

export function useRemisionBorrador(ordenId: number | null) {
  return useQuery({
    queryKey: ['remision-borrador', ordenId],
    queryFn: () => api.get<RemisionBorrador>(`/api/remisiones/orden/${ordenId}/borrador`),
    enabled: ordenId !== null,
  });
}

export function useAvanceEntrega(ordenId: number | null) {
  return useQuery({
    queryKey: ['ventas', 'avance-entrega', ordenId],
    queryFn: () => api.get<AvanceEntregaResponse>(`/api/ventas/${ordenId}/avance-entrega`),
    enabled: ordenId !== null,
  });
}

// POST /api/remisiones/ → crea BORRADOR (sin folio; el folio se asigna al
// emitir).
export function useCrearBorrador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RemisionCreatePayload) =>
      api.post<RemisionEstadoResponse>('/api/remisiones/', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['remisiones'] });
    },
  });
}

// PUT /api/remisiones/{id} — solo borrador. `detalles: undefined/null` no
// toca líneas existentes.
export function useActualizarBorrador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: RemisionUpdatePayload }) =>
      api.put<RemisionEstadoResponse>(`/api/remisiones/${id}`, payload),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['remisiones'] });
      void qc.invalidateQueries({ queryKey: ['remision', vars.id] });
    },
  });
}

// DELETE /api/remisiones/{id} — solo borrador. 204 sin body.
export function useEliminarBorrador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/remisiones/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['remisiones'] });
    },
  });
}

function esEmitirErrorDetail(d: unknown): d is EmitirErrorDetail {
  return (
    !!d &&
    typeof d === 'object' &&
    typeof (d as { mensaje?: unknown }).mensaje === 'string' &&
    Array.isArray((d as { excesos?: unknown }).excesos)
  );
}

// Fetch local (NO usa `api.post`): el 400 de sobre-entrega manda
// `detail = {mensaje, excesos: [...]}` (service.emitir), y `api.ts::request`
// pasa TODO `detail` por `normalizeDetail`, que solo desempaqueta `msg` — un
// objeto sin esa key cae al `JSON.stringify` genérico. Repetimos aquí la
// forma de `request()` pero preservando el detail estructurado para que la
// UI muestre el desglose por partida en vez de un JSON crudo. No se toca
// `normalizeDetail` global — sigue igual para el resto de features que sí
// esperan un string.
async function postEmitir(id: number): Promise<RemisionEmitirResponse> {
  const r = await fetch(`/api/remisiones/${id}/emitir`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const rawDetail = (body as { detail?: unknown }).detail;
    const err: RemisionEmitirError = {
      status: r.status,
      detail: esEmitirErrorDetail(rawDetail) ? rawDetail : normalizeDetail(rawDetail, r.statusText),
    };
    throw err;
  }
  return r.json() as Promise<RemisionEmitirResponse>;
}

// POST /api/remisiones/{id}/emitir → asigna folio y pasa a EMITIDA.
export function useEmitir() {
  const qc = useQueryClient();
  return useMutation<RemisionEmitirResponse, RemisionEmitirError, number>({
    mutationFn: (id: number) => postEmitir(id),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ['remisiones'] });
      void qc.invalidateQueries({ queryKey: ['remision', id] });
    },
  });
}

// PATCH /api/remisiones/{id}/recepcion — body JSON {recibido_por}. El
// endpoint viejo mandaba `recibido_por` como query param; el router v2
// (Task 7) lo cambió a body, así que este mutationFn manda el payload como
// body, no en la URL.
export function useRegistrarRecepcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, recibido_por }: { id: number; recibido_por: string }) =>
      api.patch<RecepcionResponse>(`/api/remisiones/${id}/recepcion`, { recibido_por }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['remisiones'] });
      void qc.invalidateQueries({ queryKey: ['remision', vars.id] });
    },
  });
}

// POST /api/remisiones/{id}/cancelar — body {motivo}.
export function useCancelar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) =>
      api.post<RemisionEstadoResponse>(`/api/remisiones/${id}/cancelar`, {
        motivo,
      } satisfies RemisionCancelarPayload),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['remisiones'] });
      void qc.invalidateQueries({ queryKey: ['remision', vars.id] });
    },
  });
}

// POST /api/remisiones/{id}/crear-cotizacion → convierte la remisión en una
// orden de venta (cotización) nueva.
export function useCrearCotizacionDesde() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<RemisionCrearCotizacionResponse>(`/api/remisiones/${id}/crear-cotizacion`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['remisiones'] });
    },
  });
}

export function useOrdenesRemisionables() {
  // Órdenes ya convertidas a venta (estatus != cotizacion) candidatas a remisión.
  return useQuery({
    queryKey: ['ventas', 'historial', 'remisionables'],
    queryFn: async () => {
      const items = await api.get<OrdenHistorialItem[]>('/api/ventas/historial?limit=200');
      return items.filter((o) => (o.estatus || '').toLowerCase() !== 'cotizacion');
    },
  });
}
