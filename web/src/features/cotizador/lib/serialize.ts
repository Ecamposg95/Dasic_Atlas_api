// Builds the POST /api/ventas and PUT /api/ventas/{id} payload from Zustand
// store state. Pure function — no side effects, no network calls.

import type { CartItem, OrdenVentaCreate } from '../types';

export type CotizadorSnapshot = {
  cliente_id: number | null;
  contacto_id: number | null;
  moneda: 'MXN' | 'USD';
  tc: number;                               // DOF (TC oficial Banxico)
  tc_mn_a_usd: number | null;               // legacy; backend lo ignora (usa tasa de venta = DOF+tol)
  tc_usd_a_mn: number | null;               // override tasa de venta, null = backend deriva DOF+tolerancia_tc
  tolerancia_tc: number;                    // spread DOF+X aplicado a la tasa de venta (0.1-1.0)
  fecha_creacion: string | null;     // 'YYYY-MM-DD'
  fecha_vencimiento: string | null;
  observaciones: string;
  terminos_condiciones: string;
  pdf_concepto_unificado: string;
  pdf_concepto_enabled: boolean;
  cart: CartItem[];
};

// Internal helpers — not exported.

function hayOverrideSku(it: CartItem): boolean {
  return it.sku_original != null && it.sku !== it.sku_original;
}

function hayOverrideNom(it: CartItem): boolean {
  return it.nom_original != null && it.nom !== it.nom_original;
}

export function buildSavePayload(s: CotizadorSnapshot): OrdenVentaCreate {
  return {
    cliente_id: s.cliente_id,
    contacto_id: s.contacto_id,
    moneda: s.moneda,
    tipo_cambio: s.tc,
    tc_mn_a_usd: s.tc_mn_a_usd,
    tc_usd_a_mn: s.tc_usd_a_mn,
    tolerancia_tc: s.tolerancia_tc,
    // Se manda la fecha PELADA. El `T00:00:00` que se pegaba antes convertía
    // una fecha de calendario en un instante, y el backend —cuya columna era
    // timestamptz— lo anclaba en UTC; al pintarlo en CDMX retrocedía un día.
    // Ahora la columna es DATE y el contrato es una fecha, sin más.
    fecha_creacion: s.fecha_creacion || null,
    fecha_vencimiento: s.fecha_vencimiento || null,
    observaciones: s.observaciones || null,
    terminos_condiciones: s.terminos_condiciones || null,
    // Map store fields → backend schema (`app/schemas/sales.py:102-103`):
    //   pdf_concepto_enabled (bool) → pdf_unificado (0|1 int)
    //   pdf_concepto_unificado (string) → concepto_unificado (string|null)
    // Cuando el toggle está OFF, concepto_unificado va null aunque el textarea
    // tenga texto residual — el backend trata pdf_unificado=0 como "desglose".
    pdf_unificado: s.pdf_concepto_enabled ? 1 : 0,
    concepto_unificado: s.pdf_concepto_enabled
      ? (s.pdf_concepto_unificado || null)
      : null,
    detalles: s.cart.map((i) => {
      if (i.tipo_linea === 'producto_fantasma') {
        // Fantasmas: producto_id NULL, sku/descripcion/costo SIEMPRE explícitos
        // (no hay catálogo del cual derivarlos). proveedor_sugerido_id va
        // adelante para que la línea cuente en sugerir-oc.
        return {
          producto_id: null,
          servicio_id: null,
          cantidad: i.qty,
          utilidad: i.utilidad,
          descuento: i.descuento,
          descuento_proveedor: i.descuento_proveedor || 0,
          moneda_origen: i.productCurrency,
          sku_libre: i.sku && i.sku !== '—' ? i.sku : null,
          descripcion_libre: i.nom,
          costo_unitario: i.cost,
          tipo_linea: 'producto_fantasma' as const,
          proveedor_sugerido_id: i.proveedor_sugerido_id ?? null,
          entrega_min: i.entrega_min,
          entrega_max: i.entrega_max,
          entrega_unidad: i.entrega_unidad,
          observaciones_linea: i.observaciones_linea || null,
          marca: i.marca ?? null,
          marca_id: i.marca_id ?? null,
          clave_prod_serv: i.clave_prod_serv ?? null,
          clave_unidad_sat: i.clave_unidad_sat ?? null,
          observaciones: i.observaciones ?? null,
          mostrar_marca: i.mostrar_marca ?? false,
        };
      }
      if (i.tipo_linea === 'servicio_catalogo') {
        // Servicios del catálogo: producto_id null, servicio_id es el ID
        // del Servicio. El backend toma snapshot del nombre/código en
        // `app/routers/ventas.py:634-635` cuando sku_libre/descripcion_libre
        // van vacíos. Mandamos `costo_unitario: i.cost` para que el override
        // de costo (si lo hubo en la cot) se respete en esta línea.
        return {
          producto_id: null,
          servicio_id: i.servicio_id,
          cantidad: i.qty,
          utilidad: i.utilidad,
          descuento: i.descuento,
          descuento_proveedor: i.descuento_proveedor || 0,
          moneda_origen: i.productCurrency,
          sku_libre: null,
          descripcion_libre: null,
          costo_unitario: i.cost,
          tipo_linea: 'servicio_catalogo' as const,
          proveedor_sugerido_id: null,
          entrega_min: i.entrega_min,
          entrega_max: i.entrega_max,
          entrega_unidad: i.entrega_unidad,
          observaciones_linea: i.observaciones_linea || null,
          mostrar_marca: i.mostrar_marca ?? false,
        };
      }
      // Catálogo (default): producto_id set, libres solo si override.
      return {
        producto_id: i.producto_id,
        servicio_id: null,
        cantidad: i.qty,
        utilidad: i.utilidad,
        descuento: i.descuento,
        descuento_proveedor: i.descuento_proveedor || 0,
        moneda_origen: i.productCurrency,
        sku_libre: hayOverrideSku(i) ? i.sku : null,
        descripcion_libre: hayOverrideNom(i) ? i.nom : null,
        // Pin del costo cotizado: SIEMPRE se manda el costo de la línea (no se
        // gatilla por diff vs catálogo vivo). Evita que reabrir+guardar cambie
        // precios silenciosamente cuando el catálogo se movió, y que un override
        // se pierda/falsee por drift. La OC sí usa el costo vivo (lado compras).
        costo_unitario: i.cost,
        tipo_linea: 'producto_catalogo' as const,
        proveedor_sugerido_id: i.proveedor_sugerido_id ?? null,
        entrega_min: i.entrega_min,
        entrega_max: i.entrega_max,
        entrega_unidad: i.entrega_unidad,
        observaciones_linea: i.observaciones_linea || null,
        marca: i.marca ?? null,
        mostrar_marca: i.mostrar_marca ?? false,
      };
    }),
  };
}
