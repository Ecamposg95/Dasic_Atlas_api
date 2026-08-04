import { AlertTriangle, ShoppingCart } from 'lucide-react';
import { RowExpanded } from './RowExpanded';
import { QUOTE_CAPS } from '../lib/caps';
import { useCotizador } from '../store';
import { DocumentCartTable } from '@/components/document/DocumentCartTable';
import { resolveDirectionalTcs, convertCost, lineImporte } from '../lib/calc';
import type { DocRowVM, DocRowCallbacks } from '@/components/document/types';

export function Cart() {
  const cart = useCotizador((s) => s.cart);
  const lineasNoSoportadas = useCotizador((s) => s.lineasNoSoportadas);
  const moneda = useCotizador((s) => s.moneda);
  const tc = useCotizador((s) => s.tc);
  const tcMnAUsd = useCotizador((s) => s.tc_mn_a_usd);
  const tcUsdAMn = useCotizador((s) => s.tc_usd_a_mn);
  const toleranciaTc = useCotizador((s) => s.tolerancia_tc);
  const expandedUids = useCotizador((s) => s.expandedUids);
  const toggleExpand = useCotizador((s) => s.toggleExpand);
  const updateLinea = useCotizador((s) => s.updateLinea);
  const removeLinea = useCotizador((s) => s.removeLinea);

  const tcs = resolveDirectionalTcs(tc, tcMnAUsd, tcUsdAMn, toleranciaTc);
  const rows: DocRowVM[] = cart.map((item) => {
    const esOverride =
      (item.sku_original != null && item.sku !== item.sku_original) ||
      (item.nom_original != null && item.nom !== item.nom_original) ||
      (item.cost_original != null && Number(item.cost) !== Number(item.cost_original));
    return {
      uid: item.uid,
      tipo:
        item.tipo_linea === 'producto_fantasma'
          ? 'producto_fantasma'
          : item.tipo_linea === 'servicio_catalogo'
            ? 'servicio_catalogo'
            : 'producto',
      sku: item.sku,
      nom: item.nom,
      productCurrency: item.productCurrency,
      monedaDocumento: moneda,
      toleranciaTc,
      esOverride,
      stockMax: item.tipo_linea === 'producto_catalogo' ? item.max : null,
      qty: item.qty,
      qtyMax: null,
      costOrigen: Number(item.cost),
      // PRECIO UNITARIO mostrado en la columna COSTO = costo convertido al TC de
      // VENTA (DOF + tolerancia) × (1 + util). El cliente lee esta columna como el
      // PU; el IMPORTE es este PU × cantidad. El costo OC real al proveedor (DOF
      // puro) vive en el detalle expandido (RowExpanded).
      costoOc:
        convertCost(Number(item.cost), item.productCurrency, moneda, tcs) *
        (1 + Number(item.utilidad) / 100),
      utilidad: item.utilidad,
      descuento: item.descuento,
      entrega_min: item.entrega_min,
      entrega_max: item.entrega_max,
      entrega_unidad: item.entrega_unidad as 'dias' | 'semanas' | null,
      importe: lineImporte(item, moneda, tcs),
      tieneNota: !!(item.observaciones_linea && item.observaciones_linea.trim()),
      expanded: expandedUids.has(item.uid),
    };
  });

  const cb: DocRowCallbacks = {
    onQty: (uid, qty) => updateLinea(uid, { qty }),
    onUtilidad: (uid, v) => updateLinea(uid, { utilidad: v }),
    onDescuento: (uid, v) => updateLinea(uid, { descuento: v }),
    onEntrega: (uid, patch) => updateLinea(uid, patch),
    onRemove: (uid) => removeLinea(uid),
    onEdit: (uid) => window.dispatchEvent(new CustomEvent('cot:edit-line', { detail: { uid } })),
    onToggleExpand: (uid) => toggleExpand(uid),
  };

  const emptyHint = (
    <div className="bg-card border border-border border-dashed rounded-xl p-8 text-center">
      <ShoppingCart className="mx-auto h-7 w-7 text-muted-foreground mb-2" />
      <div className="text-xs font-medium text-foreground">El carrito está vacío</div>
      <p className="text-[11px] text-muted-foreground mt-1">
        Busca productos arriba y agrégalos para empezar.
      </p>
    </div>
  );

  return (
    <div className="space-y-2">
      {lineasNoSoportadas.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-700/50 text-amber-200 rounded-xl p-2 text-xs flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
          <div>
            <div className="font-semibold mb-1">
              Cotización con {lineasNoSoportadas.length} línea(s) no soportadas en este editor
            </div>
            <p className="text-[11px] text-amber-300">
              Líneas con formato legacy que no se pueden hidratar al cart se
              ocultan aquí para evitar borrarlas al guardar. Si necesitas
              editarlas, abre la cotización en el cotizador clásico:{' '}
              <a
                href={`/spa/cotizador?edit=${useCotizador.getState().editingId}`}
                className="underline"
              >
                cotizador clásico
              </a>
              . El botón Guardar está deshabilitado mientras esto sea visible.
            </p>
            <ul className="text-[11px] mt-1 list-disc list-inside text-amber-300/80">
              {lineasNoSoportadas.slice(0, 5).map((l) => (
                <li key={l.detalle_id}>
                  {l.descripcion} (x{l.cantidad})
                </li>
              ))}
              {lineasNoSoportadas.length > 5 && (
                <li>… y {lineasNoSoportadas.length - 5} más</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <DocumentCartTable
        rows={rows}
        caps={QUOTE_CAPS}
        cb={cb}
        sortable
        onReorder={(f, t) => useCotizador.getState().reordenarLinea(f, t)}
        expandedRenderer={(uid, variant) => {
          const item = cart.find((c) => c.uid === uid);
          return item ? <RowExpanded item={item} variant={variant} /> : null;
        }}
        emptyHint={emptyHint}
      />
    </div>
  );
}
