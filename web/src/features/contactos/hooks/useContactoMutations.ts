import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Contacto, ContactoInput } from '../types';

export function useContactosEmpresa(clienteId: number | null) {
  return useQuery<Contacto[]>({
    queryKey: ['contactos', clienteId],
    queryFn: () => api.get<Contacto[]>(`/api/clientes/${clienteId}/contactos`),
    enabled: clienteId !== null,
  });
}

export function useGuardarContacto(clienteId: number) {
  const qc = useQueryClient();
  return useMutation<Contacto, { status?: number; detail?: string }, { id?: number; data: ContactoInput }>({
    mutationFn: ({ id, data }) =>
      id
        ? api.patch<Contacto>(`/api/clientes/${clienteId}/contactos/${id}`, data)
        : api.post<Contacto>(`/api/clientes/${clienteId}/contactos`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contactos', clienteId] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      void qc.invalidateQueries({ queryKey: ['contactos', 'global'] });
    },
  });
}

export function useEliminarContacto(clienteId: number) {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, { status?: number; detail?: string }, number>({
    mutationFn: (id) => api.delete<{ ok: boolean }>(`/api/clientes/${clienteId}/contactos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contactos', clienteId] });
      void qc.invalidateQueries({ queryKey: ['contactos', 'global'] });
    },
    // Sin esto, un borrado rechazado por el backend no dejaba rastro: la fila
    // seguía ahí y el usuario no sabía si había pasado algo.
    onError: (err) => {
      toast({
        kind: 'error',
        title: 'No se pudo eliminar el contacto',
        description: err?.detail || 'Error desconocido',
      });
    },
  });
}
