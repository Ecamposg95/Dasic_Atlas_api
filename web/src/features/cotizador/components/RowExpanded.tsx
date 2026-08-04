import { Truck, Coins } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useCotizador } from '../store';
import { convertCostDOF } from '../lib/calc';
import type { CartItem } from '../types';

function fmt(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * El panel de detalle se usa en dos contextos:
 *  - `variant="row"` (default, desktop): se inyecta en el `<tbody>` de la
 *    tabla, por eso va envuelto en `<tr><td colSpan>`.
 *  - `variant="card"` (móvil): vive dentro de un `<div>` (DocumentRowCard),
 *    donde un `<tr>/<td>` suelto sería HTML inválido — se envuelve en `<div>`.
 */
export function RowExpanded({
  item,
  variant = 'row',
}: {
  item: CartItem;
  variant?: 'row' | 'card';
}) {
  const moneda = useCotizador((s) => s.moneda);
  const tc = useCotizador((s) => s.tc);
  const updateLinea = useCotizador((s) => s.updateLinea);

  const fuente =
    item.tipo_linea === 'producto_fantasma'
      ? 'capturado al crear el fantasma'
      : 'viene del catálogo del producto';

  // Costo OC (lo que Dasic le paga al proveedor): usa DOF puro (sin spread)
  // y aplica el descuento del PROVEEDOR sobre ese valor. Match exacto a
  // CotProveedor!I6 del Excel (G6 * (1 - H6)). El descuento al CLIENTE
  // (`item.descuento`, Excel N6) NO entra en este cálculo — solo afecta
  // el precio de venta, no el costo OC.
  const costoOcOrigen = Number(item.cost) * (1 - Number(item.descuento_proveedor || 0) / 100);
  const costoOc = convertCostDOF(
    costoOcOrigen,
    item.productCurrency,
    moneda,
    tc,
  );

  const grid = (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Coins className="h-2.5 w-2.5" />
              Moneda origen
            </label>
            <div
              className="h-8 px-2 rounded border border-border bg-background/50 flex items-center justify-between gap-2 font-mono text-xs text-foreground"
              title={fuente}
            >
              <span>{item.productCurrency}</span>
              <span>${fmt(Number(item.cost))}</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{fuente}</div>
            {item.productCurrency !== moneda && (
              <div className="text-[10px] text-amber-400 mt-0.5">
                Se aplica TC automáticamente.
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Descuento cliente %
            </label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={item.descuento}
              onChange={(e) =>
                updateLinea(item.uid, {
                  descuento: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                })
              }
              className="h-8 text-xs"
              title="Descuento aplicado al CLIENTE (reduce precio de venta). Excel N6."
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Descuento proveedor %
            </label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={item.descuento_proveedor}
              onChange={(e) =>
                updateLinea(item.uid, {
                  descuento_proveedor: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                })
              }
              className="h-8 text-xs"
              title="Descuento que el PROVEEDOR le da a Dasic (reduce costo OC). Excel H6."
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Truck className="h-2.5 w-2.5" />
              Costo OC (DOF)
            </label>
            <div
              className="h-8 px-2 rounded border border-border bg-background/50 flex items-center justify-end text-xs font-mono text-foreground"
              title="Costo a tipo de cambio DOF (sin spread) — lo que se le paga al proveedor cuando se genera la OC."
            >
              {moneda} ${fmt(costoOc)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Sin spread · descuento proveedor aplicado
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Nota / texto al cliente
            </label>
            <textarea
              value={item.observaciones_linea}
              onChange={(e) => updateLinea(item.uid, { observaciones_linea: e.target.value })}
              rows={2}
              className="w-full text-xs rounded border border-border-strong bg-card px-2 py-1 focus:border-accent-glow outline-none resize-none"
            />
          </div>
          {/* US-013/014: checkbox por producto — concatena la marca en el PDF. */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Marca en PDF
            </label>
            <label
              className="h-8 px-2 rounded border border-border bg-background/50 flex items-center gap-2 cursor-pointer"
              title="Si está activo, la marca se imprime debajo de la descripción en el PDF de cotización."
            >
              <input
                type="checkbox"
                checked={item.mostrar_marca ?? false}
                onChange={(e) => updateLinea(item.uid, { mostrar_marca: e.target.checked })}
                className="rounded border-border-strong bg-surface-2"
              />
              <span className="text-xs text-foreground truncate">
                {item.marca ? item.marca : <span className="text-muted-foreground">Sin marca</span>}
              </span>
            </label>
          </div>
        </div>
  );

  if (variant === 'card') {
    return grid;
  }

  return (
    <tr className="bg-surface-2 border-b border-border">
      <td colSpan={8} className="p-3">
        {grid}
      </td>
    </tr>
  );
}
