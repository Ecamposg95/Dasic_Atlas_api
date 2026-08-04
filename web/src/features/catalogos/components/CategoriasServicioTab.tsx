import { Badge } from '@/components/ui/badge';
import {
  DataTable, DataTableBody, DataTableEmpty, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { useCategoriasServicio } from '../hooks/useCategoriasServicio';

// ─── CategoriasServicioTab ───────────────────────────────────────────────────
// Tab de solo lectura: las categorías nacen orgánicamente del CRUD de Servicios
// (campo `servicios.categoria_servicio`). No hay endpoint para crear/renombrar
// desde aquí — para añadir una, captura un Servicio con esa categoría.

export function CategoriasServicioTab() {
  const { data, isLoading } = useCategoriasServicio();

  const items = data?.en_uso ?? [];
  const sugeridas = data?.sugeridas ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {items.length} categoría(s) de servicio en uso
        </p>
        <p className="text-xs text-muted-foreground">
          Solo lectura — se generan al capturar servicios.
        </p>
      </div>

      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-3 text-left">Categoría</th>
            <th className="p-3 text-center"># Servicios</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {isLoading && (
            <DataTableEmpty colSpan={2}>Cargando categorías de servicio…</DataTableEmpty>
          )}
          {!isLoading && items.length === 0 && (
            <DataTableEmpty colSpan={2}>Sin categorías de servicio capturadas</DataTableEmpty>
          )}
          {items.map((c) => (
            <DataTableRow key={c.categoria}>
              <td className="p-3 text-foreground">{c.categoria}</td>
              <td className="p-3 text-center">
                <Badge variant={c.n_servicios > 0 ? 'cyan' : 'slate'}>{c.n_servicios}</Badge>
              </td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      {sugeridas.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold">Sugeridas:</span>{' '}
          {sugeridas.join(', ')}
        </div>
      )}
    </div>
  );
}
