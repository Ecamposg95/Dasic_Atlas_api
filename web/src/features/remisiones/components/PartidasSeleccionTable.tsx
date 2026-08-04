import { Ruler } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DataTable, DataTableBody, DataTableHead, DataTableRow,
} from '@/components/ui/data-table';
import { useUnidades } from '@/features/catalogos/hooks/useUnidades';
import { useRemision } from '../store';

function fmtQty(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/** Tabla de selección de partidas — solo líneas de orden (`detalle_orden_id
 * != null`). Vive ANTES del carrito compartido (DocumentCartTable): trae
 * columnas de acumulado (Cotizado/Entregado/Pendiente) que el carrito no
 * tiene espacio para mostrar, y el input "A entregar" NO topa al pendiente
 * (a diferencia del carrito) — la sobre-entrega la autoriza el backend en
 * /emitir, aquí solo se avisa con el badge ámbar. */
export function PartidasSeleccionTable() {
  const lineas = useRemision((s) => s.lineas.filter((l) => l.detalle_orden_id != null));
  const toggleIncluir = useRemision((s) => s.toggleIncluir);
  const setQty = useRemision((s) => s.setQty);
  const setUnidad = useRemision((s) => s.setUnidad);
  const seleccionarTodas = useRemision((s) => s.seleccionarTodasPartidas);
  const limpiarSeleccion = useRemision((s) => s.limpiarSeleccionPartidas);
  const { data: unidades } = useUnidades();
  const opcionesUnidad = (unidades ?? []).filter((u) => u.activa).map((u) => u.nombre);

  if (lineas.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Partidas de la orden
        </h3>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={seleccionarTodas}>
            Seleccionar todas
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={limpiarSeleccion}>
            Limpiar
          </Button>
        </div>
      </div>
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="p-2 w-8"></th>
            <th className="p-2 text-left">Descripción</th>
            <th className="p-2 text-right w-24">Cotizado</th>
            <th className="p-2 text-right w-24">Entregado</th>
            <th className="p-2 text-right w-24">Pendiente</th>
            <th className="p-2 text-center w-28">A entregar</th>
            <th className="p-2 text-center w-28">
              <span className="inline-flex items-center gap-1 justify-center">
                <Ruler className="h-3 w-3" /> Unidad
              </span>
            </th>
            <th className="p-2 text-left w-56"></th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {lineas.map((l) => {
            const sobreEntrega = l.pendiente != null && l.cantidad > l.pendiente;
            return (
              <DataTableRow key={l.uid} className={!l.incluir ? 'opacity-50' : undefined}>
                <td className="p-2 align-top">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={l.incluir}
                    onChange={() => toggleIncluir(l.uid)}
                  />
                </td>
                <td className="p-2 align-top">
                  <div className="font-mono text-xs text-accent-glow">{l.sku}</div>
                  <div className="text-sm">{l.descripcion}</div>
                </td>
                <td className="p-2 align-top text-right font-mono text-xs">{fmtQty(l.cotizado ?? 0)}</td>
                <td className="p-2 align-top text-right font-mono text-xs">{fmtQty(l.entregado ?? 0)}</td>
                <td className="p-2 align-top text-right font-mono text-xs">{fmtQty(l.pendiente ?? 0)}</td>
                <td className="p-2 align-top text-center">
                  <Input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={l.cantidad}
                    disabled={!l.incluir}
                    onChange={(e) => setQty(l.uid, Math.max(0, parseFloat(e.target.value) || 0))}
                    className="h-7 text-center text-xs px-1 w-24 mx-auto"
                  />
                </td>
                <td className="p-2 align-top">
                  <select
                    value={l.unidad ?? ''}
                    disabled={!l.incluir}
                    onChange={(e) => setUnidad(l.uid, e.target.value)}
                    className="h-7 text-[11px] rounded border border-border bg-card px-1 w-full"
                  >
                    <option value="">—</option>
                    {l.unidad && !opcionesUnidad.includes(l.unidad) && (
                      <option value={l.unidad}>{l.unidad}</option>
                    )}
                    {opcionesUnidad.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2 align-top">
                  {sobreEntrega && (
                    <Badge variant="amber">Sobre-entrega — requiere autorización</Badge>
                  )}
                </td>
              </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
