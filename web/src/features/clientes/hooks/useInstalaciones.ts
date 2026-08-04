import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, normalizeDetail } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Activo, ActivoInput, Planta, PlantaInput } from '../types';

// ─── Plantas y Activos instalados por cliente ────────────────────────────────
// Query keys:
//   ['plantas', clienteId]            → listado de plantas del cliente
//   ['activos', clienteId, plantaId]  → activos (plantaId null = todos)
// Invalidar con prefijo ['activos', clienteId] cubre todos los filtros.

function errDetail(err: unknown, fallback: string): string {
  return normalizeDetail((err as { detail?: unknown })?.detail, fallback);
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function usePlantas(clienteId: number) {
  return useQuery<Planta[]>({
    queryKey: ['plantas', clienteId],
    queryFn: () => api.get<Planta[]>(`/api/clientes/${clienteId}/plantas`),
    enabled: clienteId > 0,
  });
}

export function useActivos(clienteId: number, plantaId: number | null = null) {
  return useQuery<Activo[]>({
    queryKey: ['activos', clienteId, plantaId],
    queryFn: () =>
      api.get<Activo[]>(
        `/api/clientes/${clienteId}/activos${plantaId != null ? `?planta_id=${plantaId}` : ''}`,
      ),
    enabled: clienteId > 0,
  });
}

// ─── Mutations: Plantas ──────────────────────────────────────────────────────

export function useGuardarPlanta(clienteId: number) {
  const qc = useQueryClient();
  return useMutation<Planta, unknown, { id?: number; data: PlantaInput }>({
    mutationFn: ({ id, data }) =>
      id
        ? api.patch<Planta>(`/api/plantas/${id}`, data)
        : api.post<Planta>(`/api/clientes/${clienteId}/plantas`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plantas', clienteId] });
      // planta_nombre viaja denormalizado en los activos.
      void qc.invalidateQueries({ queryKey: ['activos', clienteId] });
    },
    onError: (err) => {
      toast({ kind: 'error', title: 'No se pudo guardar la planta', description: errDetail(err, 'Error desconocido') });
    },
  });
}

export function useEliminarPlanta(clienteId: number) {
  const qc = useQueryClient();
  return useMutation<void, unknown, number>({
    mutationFn: (id) => api.delete<void>(`/api/plantas/${id}`),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Planta eliminada' });
      void qc.invalidateQueries({ queryKey: ['plantas', clienteId] });
      void qc.invalidateQueries({ queryKey: ['activos', clienteId] });
    },
    onError: (err) => {
      // 409 del backend: la planta tiene activos instalados.
      toast({ kind: 'error', title: 'No se pudo eliminar la planta', description: errDetail(err, 'Error desconocido') });
    },
  });
}

// ─── Mutations: Activos ──────────────────────────────────────────────────────

export function useGuardarActivo(clienteId: number) {
  const qc = useQueryClient();
  return useMutation<Activo, unknown, { id?: number; data: ActivoInput }>({
    mutationFn: ({ id, data }) =>
      id
        ? api.patch<Activo>(`/api/activos/${id}`, data)
        : api.post<Activo>(`/api/clientes/${clienteId}/activos`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['activos', clienteId] });
    },
    onError: (err) => {
      // 400 del backend: planta_id no pertenece al cliente, etc.
      toast({ kind: 'error', title: 'No se pudo guardar el activo', description: errDetail(err, 'Error desconocido') });
    },
  });
}

export function useEliminarActivo(clienteId: number) {
  const qc = useQueryClient();
  return useMutation<void, unknown, number>({
    mutationFn: (id) => api.delete<void>(`/api/activos/${id}`),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Activo eliminado' });
      void qc.invalidateQueries({ queryKey: ['activos', clienteId] });
    },
    onError: (err) => {
      toast({ kind: 'error', title: 'No se pudo eliminar el activo', description: errDetail(err, 'Error desconocido') });
    },
  });
}
