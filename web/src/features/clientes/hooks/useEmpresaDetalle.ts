import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { invalidarCobranza } from '@/lib/cobranza-cache';
import type { TransaccionCuenta, CxCClienteResponse } from '../types';

export function useEstadoCuenta(clienteId: number | null) {
  return useQuery<TransaccionCuenta[]>({
    queryKey: ['estado-cuenta', clienteId],
    queryFn: () => api.get<TransaccionCuenta[]>(`/api/clientes/${clienteId}/estado-cuenta`),
    enabled: clienteId !== null,
  });
}

export function useCxCCliente(clienteId: number | null) {
  return useQuery<CxCClienteResponse>({
    queryKey: ['cxc-cliente', clienteId],
    queryFn: () => api.get<CxCClienteResponse>(`/api/clientes/${clienteId}/cuentas-por-cobrar`),
    enabled: clienteId !== null,
  });
}

export function useOrdenesEmpresa(clienteId: number | null) {
  return useQuery<import('@/features/contactos/types').ContactoOrden[]>({
    queryKey: ['empresa-ordenes', clienteId],
    queryFn: () => api.get(`/api/clientes/${clienteId}/ordenes`),
    enabled: clienteId !== null,
  });
}

export function useRegistrarPago(clienteId: number) {
  const qc = useQueryClient();
  return useMutation<{ mensaje: string; nuevo_saldo: number }, { status?: number; detail?: string }, { monto: number; descripcion: string }>({
    mutationFn: ({ monto, descripcion }) =>
      api.post<{ mensaje: string; nuevo_saldo: number }>(
        `/api/clientes/${clienteId}/registrar-pago?monto=${monto}&descripcion=${encodeURIComponent(descripcion)}`,
      ),
    onSuccess: () => invalidarCobranza(qc, clienteId),
  });
}
