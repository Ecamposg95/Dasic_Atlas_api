// web/src/features/usuarios/hooks/useUsuarios.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Usuario } from '../types';

export function useUsuarios(enabled = true) {
  return useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>('/api/usuarios/'),
    staleTime: 30_000,
    enabled,
  });
}
