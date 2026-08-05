import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TendenciaResponse } from '../types';

export function useTendencia(meses = 12) {
  return useQuery<TendenciaResponse>({
    queryKey: ['dashboard', 'tendencia', meses],
    queryFn: () => api.get<TendenciaResponse>(`/api/dashboard/tendencia?meses=${meses}`),
    staleTime: 60_000,
    // El dashboard es la pantalla que se deja abierta. Con `refetchOnMount`
    // por defecto ya se refresca al navegar a él, pero el default global apaga
    // `refetchOnWindowFocus` —correcto en pantallas de edición, donde un
    // refetch pisaría lo que se está capturando— y aquí no hay nada que pisar:
    // sin esto, una pestaña abierta desde la mañana seguía mostrando el stock
    // crítico y los saldos vencidos de entonces.
    refetchOnWindowFocus: true,
  });
}
