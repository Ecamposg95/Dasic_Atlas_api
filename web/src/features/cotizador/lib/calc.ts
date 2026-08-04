/**
 * calc.ts — Pricing utilities for the cotizador live preview.
 *
 * Modelo TC unificado (2026-06-10): hay UNA sola tasa de venta = DOF + tolerancia,
 * usada en ambas direcciones, más el DOF (oficial Banxico) que se usa solo para
 * la OC al proveedor.
 *
 *   - tc_dof:       TC oficial Banxico (lo que llena el usuario) → costo / OC
 *   - tasa venta:   DOF + tolerancia → × para USD→MN, ÷ para MN→USD
 *
 * (tc_mn_a_usd y tc_usd_a_mn del TcSet quedan iguales a la tasa de venta.)
 * El spread cubre riesgo cambiario entre cotización y cobro: Dasic captura un
 * margen implícito sobre el TC además de la utilidad explícita por línea.
 *
 * Pure functions que reflejan el backend's `_convert_cost_to_quote_currency`.
 */

import type { CartItem, Moneda } from '../types';

export type TcSet = {
  tc_dof: number;        // DOF (Banxico oficial)
  tc_mn_a_usd: number;   // efectivo para conversión MN → USD
  tc_usd_a_mn: number;   // efectivo para conversión USD → MN
};

/**
 * Conversión de costo del proveedor a la divisa de cotización.
 *
 * Usa los TCs DIRECCIONALES (no el DOF), porque la cotización al cliente
 * incluye el spread como colchón. Para "Costo OC" (lo que se le paga al
 * proveedor) usa `convertCostDOF` en su lugar.
 *
 * Reglas:
 *   - Mismo origen y destino → sin conversión
 *   - USD → MXN: costo * tc_usd_a_mn (tasa de venta = DOF + tol)
 *   - MXN → USD: costo / tc_mn_a_usd (misma tasa de venta = DOF + tol; guarded vs ≤ 0)
 */
export function convertCost(
  costo: number,
  monedaOrigen: Moneda,
  monedaCotizacion: Moneda,
  tcs: TcSet,
): number {
  if (monedaOrigen === monedaCotizacion) return costo;
  if (monedaOrigen === 'USD' && monedaCotizacion === 'MXN') {
    return costo * tcs.tc_usd_a_mn;
  }
  if (monedaOrigen === 'MXN' && monedaCotizacion === 'USD') {
    if (tcs.tc_mn_a_usd <= 0) return costo;
    return costo / tcs.tc_mn_a_usd;
  }
  return costo;
}

/**
 * Conversión usando DOF puro (sin spread). Se usa para mostrar "Costo OC"
 * por línea — lo que Dasic le va a pagar al proveedor cuando se emita la
 * orden de compra. Match exacto a `CotProveedor!G6` del Excel.
 */
export function convertCostDOF(
  costo: number,
  monedaOrigen: Moneda,
  monedaCotizacion: Moneda,
  tc_dof: number,
): number {
  if (monedaOrigen === monedaCotizacion) return costo;
  if (monedaOrigen === 'USD' && monedaCotizacion === 'MXN') {
    return costo * tc_dof;
  }
  if (monedaOrigen === 'MXN' && monedaCotizacion === 'USD') {
    if (tc_dof <= 0) return costo;
    return costo / tc_dof;
  }
  return costo;
}

/**
 * Línea importe (precio extendido) usando los TCs direccionales — es lo
 * que cobra al cliente.
 *
 *   precio_unit_bruto = costo_convertido × (1 + utilidad / 100)
 *   importe           = precio_unit_bruto × qty × (1 − descuento / 100)
 */
export function lineImporte(
  item: CartItem,
  monedaCotizacion: Moneda,
  tcs: TcSet,
): number {
  const costoConvertido = convertCost(
    Number(item.cost),
    item.productCurrency,
    monedaCotizacion,
    tcs,
  );
  const precioUnitBruto = costoConvertido * (1 + Number(item.utilidad) / 100);
  return precioUnitBruto * Number(item.qty) * (1 - Number(item.descuento) / 100);
}

export type Totals = { subtotal: number; iva: number; total: number };

export function computeTotals(
  cart: CartItem[],
  monedaCotizacion: Moneda,
  tcs: TcSet,
  ivaRate: number,
): Totals {
  // Redondear el importe por línea a 2 decimales antes de sumar — igual que el
  // backend (subtotal.quantize por línea) — para que el subtotal del preview
  // cuadre con orden.total guardado y con la suma de las líneas del PDF.
  const subtotal = cart.reduce(
    (acc, item) =>
      acc + Math.round(lineImporte(item, monedaCotizacion, tcs) * 100) / 100,
    0,
  );
  const iva = subtotal * ivaRate;
  const total = subtotal + iva;
  return { subtotal, iva, total };
}

/**
 * Subtotales por moneda NATIVA — antes de IVA y SIN conversión por TC.
 *
 * Útil para que el usuario vea "esta cot tiene X líneas USD por $Y antes
 * de convertir y Z líneas MXN por $W". El importe nativo por línea es:
 *
 *   importe_nativo = cost × qty × (1 + utilidad/100) × (1 − descuento/100)
 *
 * NO se aplica TC porque el objetivo es mostrar lo que el cliente cobra
 * (o paga al proveedor) en la moneda original de cada línea, sin que el
 * spread direccional distorsione el número.
 */
export type TotalsPorMoneda = {
  mxn: number;
  usd: number;
  mxn_count: number;
  usd_count: number;
};

/**
 * Costo total y margen de ganancia FINAL de la cotización.
 *
 * "Costo" = lo que Dasic efectivamente paga al proveedor, por lo que se
 * convierte con DOF puro (no con los TCs direccionales con spread) y se
 * aplica el `descuento_proveedor` de cada línea (descuento que el proveedor
 * da a Dasic, columna H6 del Excel — independiente del descuento al cliente).
 *
 *   costo_linea = costo_origen × qty × (1 − descuento_proveedor / 100)
 *   costo_total = Σ convertCostDOF(costo_linea, …)
 *
 * Margen $ = subtotal (lo que cobra al cliente, ya con TC spread) − costo_total
 * Margen % = (margen / subtotal) × 100  — margen sobre venta (gross margin)
 *
 * Esta es la "ganancia real" porque incluye TANTO la utilidad explícita por
 * línea COMO el spread del TC (DOF±tolerancia) que el cotizador cobra al
 * cliente pero NO le paga al proveedor.
 */
export type CostosResumen = {
  costo: number;     // costo total en moneda cotización (vía DOF puro)
  margen: number;    // subtotal − costo
  margenPct: number; // (margen / subtotal) × 100; 0 si subtotal = 0
};

export function computeCostos(
  cart: CartItem[],
  monedaCotizacion: Moneda,
  tcs: TcSet,
  subtotal: number,
): CostosResumen {
  const costo = cart.reduce((acc, item) => {
    const descProv = Number(item.descuento_proveedor) || 0;
    const costoNetoOrigen = Number(item.cost) * (1 - descProv / 100);
    const costoConvertido = convertCostDOF(
      costoNetoOrigen,
      item.productCurrency,
      monedaCotizacion,
      tcs.tc_dof,
    );
    return acc + costoConvertido * Number(item.qty);
  }, 0);
  const margen = subtotal - costo;
  const margenPct = subtotal > 0 ? (margen / subtotal) * 100 : 0;
  return { costo, margen, margenPct };
}

export function computeTotalsPorMoneda(cart: CartItem[]): TotalsPorMoneda {
  let mxn = 0;
  let usd = 0;
  let mxn_count = 0;
  let usd_count = 0;
  for (const item of cart) {
    const importeNativo =
      Number(item.cost) *
      Number(item.qty) *
      (1 + Number(item.utilidad) / 100) *
      (1 - Number(item.descuento) / 100);
    if (item.productCurrency === 'USD') {
      usd += importeNativo;
      usd_count += 1;
    } else {
      mxn += importeNativo;
      mxn_count += 1;
    }
  }
  return { mxn, usd, mxn_count, usd_count };
}

/**
 * Resuelve la TASA DE VENTA única a partir del DOF (modelo unificado 2026-06-10).
 * Mismo comportamiento que el helper backend `_resolve_directional_tcs`.
 * Hay UNA sola tasa de venta = DOF + tolerancia, usada en ambas direcciones
 * (× para USD→MN, ÷ para MN→USD); por eso `tc_mn_a_usd` y `tc_usd_a_mn` del
 * resultado son iguales. El parámetro `_tc_mn_a_usd` se ignora (el override que
 * manda es el de la dirección de venta). `tolerancia` define el spread.
 */
export function resolveDirectionalTcs(
  tc_dof: number,
  tc_mn_a_usd: number | null,
  tc_usd_a_mn: number | null,
  tolerancia: number = 1,
): TcSet {
  const t = Number.isFinite(tolerancia) && tolerancia > 0 ? tolerancia : 1;
  // Banda de plausibilidad [DOF·0.5, DOF·1.5]: un TC direccional real jamás
  // se aleja >50% del DOF. Un valor fuera de banda (p.ej. el sentinela legacy
  // 0.000001 persistido en cotizaciones viejas, o un 2.0 corrupto) se IGNORA y
  // se deriva del DOF — antes se confiaba en él y `costo / 0.000001` reventaba
  // el importe ×1,000,000. Espejo exacto de `_resolve_directional_tcs` (backend).
  const lo = tc_dof * 0.5;
  const hi = tc_dof * 1.5;
  const trust = (v: number | null): v is number =>
    v != null && v >= lo && v <= hi;
  // Modelo direccional (2026-08-04, regla de negocio DASIC): la tolerancia
  // protege contra la volatilidad EN AMBAS direcciones:
  //   USD→MN multiplica por DOF + tolerancia (más pesos por dólar cobrado).
  //   MN→USD divide entre DOF − tolerancia (más dólares por peso cobrado).
  // Sustituye al "modelo unificado" del 2026-06-10 (una sola tasa espejo),
  // que dejaba MN→USD sin protección (dividía entre DOF+tol → menos USD).
  // Overrides plausibles del payload se honran POR DIRECCIÓN (compat API).
  const baseMn = tc_dof - t;
  return {
    tc_dof,
    tc_usd_a_mn: trust(tc_usd_a_mn) ? tc_usd_a_mn : tc_dof + t,
    // Guarda: si la tolerancia alcanzara al DOF, el divisor sería <= 0 — cae al DOF.
    tc_mn_a_usd: trust(tc_mn_a_usd) ? tc_mn_a_usd : baseMn > 0 ? baseMn : tc_dof,
  };
}
