import type { DocRowVM } from '@/components/document/types';
import type { RemisionLinea } from '../store';

export function remisionLineaToVM(l: RemisionLinea, moneda: string): DocRowVM {
  return {
    uid: l.uid,
    tipo: l.tipo,
    sku: l.sku ?? '',
    nom: l.descripcion,
    productCurrency: moneda,
    monedaDocumento: moneda,
    esOverride: false,
    stockMax: null,
    qty: l.cantidad,
    qtyMax: l.cantidad_max,
    costOrigen: l.precio_unitario,
    costoOc: l.precio_unitario,
    utilidad: 0,
    descuento: 0,
    entrega_min: null,
    entrega_max: null,
    entrega_unidad: null,
    importe: l.precio_unitario * l.cantidad,
    precioUnitario: l.precio_unitario,
    unidad: l.unidad,
    expanded: l.expanded,
  };
}
