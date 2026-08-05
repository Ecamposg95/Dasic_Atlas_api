import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { EmpresaResumen, ActividadEvento, NotaEmpresa, DealEnlazado } from '../types';

export function useEmpresaResumen(id: number) {
  return useQuery<EmpresaResumen>({
    queryKey: ['empresa', id, 'resumen'],
    queryFn: () => api.get<EmpresaResumen>(`/api/clientes/${id}/resumen`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useEmpresaActividad(id: number) {
  return useQuery<ActividadEvento[]>({
    queryKey: ['empresa', id, 'actividad'],
    queryFn: () => api.get<ActividadEvento[]>(`/api/clientes/${id}/actividad`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useNotasEmpresa(id: number) {
  return useQuery<NotaEmpresa[]>({
    queryKey: ['empresa', id, 'notas'],
    queryFn: () => api.get<NotaEmpresa[]>(`/api/clientes/${id}/notas`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCrearNota(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (texto: string) => api.post<NotaEmpresa>(`/api/clientes/${id}/notas`, { texto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa', id, 'notas'] }),
  });
}

export function useBorrarNota(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notaId: number) => api.delete(`/api/clientes/${id}/notas/${notaId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa', id, 'notas'] }),
    onError: (err) => {
      toast({
        kind: 'error',
        title: 'No se pudo borrar la nota',
        description: (err as { detail?: string })?.detail || 'Error desconocido',
      });
    },
  });
}

export function useEmpresaDeals(id: number) {
  return useQuery<DealEnlazado[]>({
    queryKey: ['empresa', id, 'deals'],
    queryFn: () => api.get<DealEnlazado[]>(`/api/clientes/${id}/deals`),
    enabled: Number.isFinite(id) && id > 0,
  });
}
