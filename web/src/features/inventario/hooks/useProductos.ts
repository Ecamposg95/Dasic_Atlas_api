import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CardexProducto, Producto } from '../types';

// Paginación server-side via skip/limit (backend retorna array plano).
// q se envía al backend (ILIKE en sku/sku_comercial/nombre/marca).
// filtroMarca (marca_id) y filtroCategoria y soloBajoStock permanecen client-side
// porque el backend no filtra por ellos en este endpoint.
// pageSize: pasa 500 para obtener todos (uso en pickers/precios).

export function useProductos(page = 1, q = '', pageSize = 50) {
  const skip = (page - 1) * pageSize;
  const params = new URLSearchParams();
  params.set('skip', String(skip));
  params.set('limit', String(pageSize));
  if (q.trim()) params.set('q', q.trim());
  return useQuery<Producto[]>({
    queryKey: ['productos', page, q.trim(), pageSize],
    queryFn: () => api.get<Producto[]>(`/api/productos?${params.toString()}`),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useCardex(productoId: number | null) {
  return useQuery<CardexProducto>({
    queryKey: ['cardex', productoId],
    queryFn: () => api.get<CardexProducto>(`/api/productos/${productoId}/cardex`),
    enabled: productoId !== null,
    staleTime: 30_000,
  });
}

// Respuesta del endpoint POST /api/productos/upload-csv.
// Caso éxito: { mensaje, creados, actualizados, omitidos, errores: string[] }.
// Caso 4xx: { detail: { mensaje?, columnas_compatibles? } } o { detail: string }.
export type ImportProductosResult = {
  mensaje?: string;
  creados: number;
  actualizados: number;
  omitidos: number;
  errores: string[];
};

export type ImportProductosError = {
  status: number;
  mensaje: string;
  columnas_compatibles?: string[];
};

// Hook para importar productos vía CSV/XLSX. Usa fetch directo (no api.post)
// porque el wrapper en @/lib/api hardcodea Content-Type: application/json y
// FormData necesita que el navegador setee multipart/form-data con boundary.
// Invalida ['productos'] al éxito para refrescar el listado.
export function useImportProductos() {
  const qc = useQueryClient();
  return useMutation<ImportProductosResult, ImportProductosError, File>({
    mutationFn: async (file) => {
      const body = new FormData();
      body.append('file', file);
      const r = await fetch('/api/productos/upload-csv', {
        method: 'POST',
        body,
        credentials: 'include',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const detail = (data as { detail?: unknown }).detail;
        if (detail && typeof detail === 'object') {
          const d = detail as { mensaje?: string; columnas_compatibles?: string[] };
          throw {
            status: r.status,
            mensaje: d.mensaje ?? 'No se pudo importar el archivo.',
            columnas_compatibles: d.columnas_compatibles,
          } satisfies ImportProductosError;
        }
        throw {
          status: r.status,
          mensaje: typeof detail === 'string' ? detail : 'No se pudo importar el archivo.',
        } satisfies ImportProductosError;
      }
      return data as ImportProductosResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      // La importación masiva altera existencias, así que el kardex cambia.
      qc.invalidateQueries({ queryKey: ['cardex'] });
    },
  });
}
