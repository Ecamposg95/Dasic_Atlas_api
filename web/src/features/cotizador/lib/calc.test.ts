/**
 * Tests del motor de cálculo del cotizador (calc.ts).
 *
 * Todas las funciones de calc.ts son puras (el módulo solo hace
 * `import type` de ../types — cero side-effects), así que se testean
 * directo sin mocks ni entorno DOM.
 *
 * Convención: cada `expected` está derivado A MANO en el comentario que lo
 * acompaña — nunca copiado del output de la función bajo test.
 */

import { describe, it, expect } from 'vitest';
import type { CartItem } from '../types';
import {
  convertCost,
  convertCostDOF,
  lineImporte,
  computeTotals,
  computeCostos,
  computeTotalsPorMoneda,
  resolveDirectionalTcs,
  type TcSet,
} from './calc';

/** TcSet canónico para los tests: DOF 17, tolerancia 1 → tasa de venta 18. */
const TCS: TcSet = { tc_dof: 17, tc_mn_a_usd: 18, tc_usd_a_mn: 18 };

/** IVA México estándar. */
const IVA = 0.16;

/** Factory de CartItem con defaults neutros; cada test sobreescribe lo relevante. */
function mkItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    uid: 'test-uid',
    tipo_linea: 'producto_catalogo',
    producto_id: 1,
    servicio_id: null,
    sku: 'SKU-1',
    nom: 'Producto de prueba',
    cost: 100,
    productCurrency: 'MXN',
    sku_original: 'SKU-1',
    nom_original: 'Producto de prueba',
    cost_original: 100,
    max: 99,
    qty: 1,
    utilidad: 0,
    descuento: 0,
    descuento_proveedor: 0,
    entrega_min: null,
    entrega_max: null,
    entrega_unidad: null,
    observaciones_linea: '',
    ...overrides,
  };
}

describe('convertCost (TC direccional con spread)', () => {
  it('misma moneda → sin conversión', () => {
    expect(convertCost(123.45, 'MXN', 'MXN', TCS)).toBe(123.45);
    expect(convertCost(99, 'USD', 'USD', TCS)).toBe(99);
  });

  it('USD → MXN multiplica por tc_usd_a_mn', () => {
    // 100 USD × 18 = 1800 MXN
    expect(convertCost(100, 'USD', 'MXN', TCS)).toBe(1800);
  });

  it('MXN → USD divide entre tc_mn_a_usd', () => {
    // 180 MXN ÷ 18 = 10 USD
    expect(convertCost(180, 'MXN', 'USD', TCS)).toBe(10);
  });

  it('guard: tc_mn_a_usd ≤ 0 devuelve el costo sin convertir', () => {
    const broken: TcSet = { tc_dof: 0, tc_mn_a_usd: 0, tc_usd_a_mn: 0 };
    expect(convertCost(50, 'MXN', 'USD', broken)).toBe(50);
  });
});

describe('convertCostDOF (DOF puro, sin spread — Costo OC)', () => {
  it('USD → MXN multiplica por el DOF, no por la tasa de venta', () => {
    // 100 USD × 17 (DOF) = 1700 MXN — nótese que convertCost daría 1800
    expect(convertCostDOF(100, 'USD', 'MXN', 17)).toBe(1700);
  });

  it('MXN → USD divide entre el DOF', () => {
    // 170 MXN ÷ 17 = 10 USD
    expect(convertCostDOF(170, 'MXN', 'USD', 17)).toBe(10);
  });

  it('guard: DOF ≤ 0 devuelve el costo sin convertir', () => {
    expect(convertCostDOF(50, 'MXN', 'USD', 0)).toBe(50);
  });

  it('misma moneda → sin conversión', () => {
    expect(convertCostDOF(42, 'USD', 'USD', 17)).toBe(42);
  });
});

describe('lineImporte (importe extendido por línea)', () => {
  it('línea catálogo MXN en cotización MXN con utilidad 30%', () => {
    // precio_unit = 100 × (1 + 30/100) = 130; importe = 130 × 2 × (1 − 0) = 260
    const item = mkItem({ cost: 100, utilidad: 30, qty: 2 });
    expect(lineImporte(item, 'MXN', TCS)).toBeCloseTo(260, 10);
  });

  it('línea USD en cotización MXN usa la tasa de venta (DOF + tolerancia)', () => {
    // costo convertido = 10 USD × 18 = 180 MXN
    // precio_unit = 180 × 1.25 = 225; importe = 225 × 3 = 675
    const item = mkItem({ cost: 10, productCurrency: 'USD', utilidad: 25, qty: 3 });
    expect(lineImporte(item, 'MXN', TCS)).toBeCloseTo(675, 10);
  });

  it('línea MXN en cotización USD divide entre la misma tasa de venta', () => {
    // costo convertido = 180 MXN ÷ 18 = 10 USD
    // precio_unit = 10 × 1.20 = 12; importe = 12 × 1 = 12
    const item = mkItem({ cost: 180, utilidad: 20, qty: 1 });
    expect(lineImporte(item, 'USD', TCS)).toBeCloseTo(12, 10);
  });

  it('descuento al cliente se aplica sobre el precio con utilidad', () => {
    // precio_unit = 200 × 1.5 = 300; importe = 300 × 1 × (1 − 10/100) = 270
    const item = mkItem({ cost: 200, utilidad: 50, qty: 1, descuento: 10 });
    expect(lineImporte(item, 'MXN', TCS)).toBeCloseTo(270, 10);
  });

  it('borde: utilidad 0 → el precio es el costo convertido', () => {
    // precio_unit = 100 × (1 + 0) = 100; importe = 100 × 1 = 100
    const item = mkItem({ cost: 100, utilidad: 0, qty: 1 });
    expect(lineImporte(item, 'MXN', TCS)).toBe(100);
  });

  it('borde: cantidad decimal', () => {
    // precio_unit = 80 × 1.25 = 100; importe = 100 × 2.5 = 250
    const item = mkItem({ cost: 80, utilidad: 25, qty: 2.5 });
    expect(lineImporte(item, 'MXN', TCS)).toBeCloseTo(250, 10);
  });
});

describe('invariante de la columna COSTO (fila auditable de izquierda a derecha)', () => {
  // La celda $ COSTO del carrito muestra `convertCost(...)` a secas: el costo
  // unitario del material convertido al TC de venta, SIN utilidad ni descuento
  // (Cart.tsx). Estos tests fijan que el resto de la fila reconstruye el
  // importe — si alguien vuelve a meter la utilidad en la columna (como hacía
  // el commit c15b8ad), la fila deja de cuadrar y estos tests lo cazan.
  const reconstruir = (costoColumna: number, item: CartItem) =>
    costoColumna *
    (1 + Number(item.utilidad) / 100) *
    Number(item.qty) *
    (1 - Number(item.descuento) / 100);

  it('línea USD en cotización MXN: COSTO × (1+util) × cant × (1−desc) = importe', () => {
    // COSTO = 10 USD × 18 = 180 MXN — sin utilidad
    // reconstruido = 180 × 1.4 × 3 × 0.9 = 680.4 = lineImporte
    const item = mkItem({
      cost: 10,
      productCurrency: 'USD',
      utilidad: 40,
      qty: 3,
      descuento: 10,
    });
    const costoColumna = convertCost(Number(item.cost), item.productCurrency, 'MXN', TCS);
    expect(costoColumna).toBe(180);
    expect(reconstruir(costoColumna, item)).toBeCloseTo(680.4, 10);
    expect(reconstruir(costoColumna, item)).toBeCloseTo(lineImporte(item, 'MXN', TCS), 10);
  });

  it('línea MXN en cotización USD: el invariante se sostiene en la dirección inversa', () => {
    // COSTO = 360 MXN ÷ 18 = 20 USD — sin utilidad
    // reconstruido = 20 × 1.25 × 2 × 0.95 = 47.5 = lineImporte
    const item = mkItem({ cost: 360, utilidad: 25, qty: 2, descuento: 5 });
    const costoColumna = convertCost(Number(item.cost), item.productCurrency, 'USD', TCS);
    expect(costoColumna).toBe(20);
    expect(reconstruir(costoColumna, item)).toBeCloseTo(47.5, 10);
    expect(reconstruir(costoColumna, item)).toBeCloseTo(lineImporte(item, 'USD', TCS), 10);
  });

  it('la columna NO trae utilidad: con util > 0, COSTO ≠ importe aunque cant = 1', () => {
    // El caso del reporte: 205.80 USD, util 33.3 %, cant 1 → COSTO 3,749.94 y
    // IMPORTE 4,998.67 son cifras DISTINTAS a propósito.
    const item = mkItem({ cost: 205.8, productCurrency: 'USD', utilidad: 33.3, qty: 1 });
    const tcs: TcSet = { tc_dof: 17.2211, tc_mn_a_usd: 16.2211, tc_usd_a_mn: 18.2211 };
    const costoColumna = convertCost(Number(item.cost), item.productCurrency, 'MXN', tcs);
    // 205.80 × 18.2211 = 3,749.90…
    expect(costoColumna).toBeCloseTo(3749.9024, 3);
    expect(costoColumna).not.toBeCloseTo(lineImporte(item, 'MXN', tcs), 2);
    expect(reconstruir(costoColumna, item)).toBeCloseTo(lineImporte(item, 'MXN', tcs), 10);
  });
});

describe('computeTotals (subtotal / IVA / total del documento)', () => {
  it('documento mixto MXN + USD cotizado en MXN', () => {
    // Línea A (MXN): 100 × 1.30 × 2       = 260.00
    // Línea B (USD): (10 × 18) × 1.25 × 3 = 675.00
    // subtotal = 260 + 675 = 935
    // iva      = 935 × 0.16 = 149.60
    // total    = 935 + 149.60 = 1084.60
    const cart = [
      mkItem({ cost: 100, utilidad: 30, qty: 2 }),
      mkItem({ cost: 10, productCurrency: 'USD', utilidad: 25, qty: 3 }),
    ];
    const t = computeTotals(cart, 'MXN', TCS, IVA);
    expect(t.subtotal).toBeCloseTo(935, 10);
    expect(t.iva).toBeCloseTo(149.6, 10);
    expect(t.total).toBeCloseTo(1084.6, 10);
  });

  it('redondea el importe POR LÍNEA a 2 decimales antes de sumar', () => {
    // Cada línea: importe crudo = 10.004 (cost 10.004, utilidad 0, qty 1)
    // Redondeo por línea: round(10.004 × 100)/100 = 10.00
    // subtotal = 10.00 + 10.00 = 20.00  (NO 20.008, que sería sumar y luego redondear)
    const cart = [mkItem({ cost: 10.004 }), mkItem({ cost: 10.004 })];
    const t = computeTotals(cart, 'MXN', TCS, IVA);
    expect(t.subtotal).toBeCloseTo(20.0, 3); // fallaría con 20.008
    // iva = 20 × 0.16 = 3.20; total = 23.20
    expect(t.iva).toBeCloseTo(3.2, 10);
    expect(t.total).toBeCloseTo(23.2, 10);
  });

  it('redondeo hacia arriba por línea', () => {
    // importe crudo = 9.99 × 1.13 = 11.2887 → redondeado por línea = 11.29
    const cart = [mkItem({ cost: 9.99, utilidad: 13 })];
    const t = computeTotals(cart, 'MXN', TCS, IVA);
    expect(t.subtotal).toBeCloseTo(11.29, 10);
  });

  it('carrito vacío → todo en cero', () => {
    const t = computeTotals([], 'MXN', TCS, IVA);
    expect(t.subtotal).toBe(0);
    expect(t.iva).toBe(0);
    expect(t.total).toBe(0);
  });
});

describe('computeCostos (costo real vía DOF + margen de la cotización)', () => {
  it('usa DOF puro y aplica descuento_proveedor por línea', () => {
    // costo neto origen = 10 USD × (1 − 10/100) = 9 USD
    // convertido con DOF: 9 × 17 = 153 MXN; × qty 2 = 306
    // Con subtotal (venta) = 500: margen = 500 − 306 = 194
    // margenPct = 194 / 500 × 100 = 38.8
    const cart = [
      mkItem({ cost: 10, productCurrency: 'USD', qty: 2, descuento_proveedor: 10 }),
    ];
    const r = computeCostos(cart, 'MXN', TCS, 500);
    expect(r.costo).toBeCloseTo(306, 10);
    expect(r.margen).toBeCloseTo(194, 10);
    expect(r.margenPct).toBeCloseTo(38.8, 10);
  });

  it('el spread del TC forma parte del margen (venta a DOF+tol, costo a DOF)', () => {
    // Línea USD cost 100, qty 1, utilidad 0, sin descuentos:
    //   venta (lineImporte) = 100 × 18 = 1800  → subtotal 1800
    //   costo (DOF)         = 100 × 17 = 1700
    //   margen = 1800 − 1700 = 100 (solo por el spread 18 vs 17)
    //   margenPct = 100 / 1800 × 100 = 5.5555…
    const cart = [mkItem({ cost: 100, productCurrency: 'USD', qty: 1 })];
    const { subtotal } = computeTotals(cart, 'MXN', TCS, IVA);
    const r = computeCostos(cart, 'MXN', TCS, subtotal);
    expect(r.costo).toBeCloseTo(1700, 10);
    expect(r.margen).toBeCloseTo(100, 10);
    expect(r.margenPct).toBeCloseTo(100 / 18, 10); // 5.5556 %
  });

  it('subtotal 0 → margenPct 0 (sin división entre cero)', () => {
    const r = computeCostos([], 'MXN', TCS, 0);
    expect(r.costo).toBe(0);
    expect(r.margen).toBe(0);
    expect(r.margenPct).toBe(0);
  });
});

describe('computeTotalsPorMoneda (subtotales nativos sin TC)', () => {
  it('separa líneas por moneda de origen sin aplicar tipo de cambio', () => {
    // MXN: 100 × 2 × 1.30 × 1 = 260
    // USD: 10 × 3 × 1.25 × 1  = 37.5  (queda en USD nativos, sin × 18)
    const cart = [
      mkItem({ cost: 100, utilidad: 30, qty: 2 }),
      mkItem({ cost: 10, productCurrency: 'USD', utilidad: 25, qty: 3 }),
    ];
    const r = computeTotalsPorMoneda(cart);
    expect(r.mxn).toBeCloseTo(260, 10);
    expect(r.usd).toBeCloseTo(37.5, 10);
    expect(r.mxn_count).toBe(1);
    expect(r.usd_count).toBe(1);
  });

  it('aplica el descuento al cliente en el importe nativo', () => {
    // 200 × 1 × 1.50 × (1 − 0.10) = 270
    const cart = [mkItem({ cost: 200, utilidad: 50, qty: 1, descuento: 10 })];
    const r = computeTotalsPorMoneda(cart);
    expect(r.mxn).toBeCloseTo(270, 10);
    expect(r.usd).toBe(0);
    expect(r.usd_count).toBe(0);
  });
});

describe('resolveDirectionalTcs (modelo direccional DOF ± tolerancia)', () => {
  it('sin overrides: USD→MN = DOF + tol y MN→USD = DOF − tol (protección bidireccional)', () => {
    // USD→MN: 17 + 1 = 18 (más pesos por dólar). MN→USD: 17 − 1 = 16 (más dólares por peso).
    const r = resolveDirectionalTcs(17, null, null, 1);
    expect(r).toEqual({ tc_dof: 17, tc_mn_a_usd: 16, tc_usd_a_mn: 18 });
  });

  it('tolerancia default es 1', () => {
    const r = resolveDirectionalTcs(17, null, null);
    expect(r.tc_usd_a_mn).toBe(18);
  });

  it('tolerancia inválida (0, negativa, NaN) cae al default 1', () => {
    expect(resolveDirectionalTcs(17, null, null, 0).tc_usd_a_mn).toBe(18);
    expect(resolveDirectionalTcs(17, null, null, -3).tc_usd_a_mn).toBe(18);
    expect(resolveDirectionalTcs(17, null, null, NaN).tc_usd_a_mn).toBe(18);
  });

  it('tolerancia fraccionaria válida', () => {
    // USD→MN: 17 + 0.5 = 17.5; MN→USD: 17 − 0.5 = 16.5
    const r = resolveDirectionalTcs(17, null, null, 0.5);
    expect(r.tc_usd_a_mn).toBe(17.5);
    expect(r.tc_mn_a_usd).toBe(16.5);
  });

  it('honra un override plausible de tc_usd_a_mn SOLO en su dirección', () => {
    // 18.5 está dentro de la banda [17×0.5, 17×1.5] = [8.5, 25.5].
    // MN→USD no tiene override → deriva DOF − tol = 16.
    const r = resolveDirectionalTcs(17, null, 18.5, 1);
    expect(r.tc_usd_a_mn).toBe(18.5);
    expect(r.tc_mn_a_usd).toBe(16);
  });

  it('ignora un override fuera de banda (sentinela legacy 0.000001)', () => {
    // 0.000001 < 8.5 → no confiable → deriva DOF + tol = 18
    const r = resolveDirectionalTcs(17, null, 0.000001, 1);
    expect(r.tc_usd_a_mn).toBe(18);
  });

  it('override de tc_mn_a_usd fuera de banda se ignora (deriva DOF − tol)', () => {
    // 99 > 25.5 (banda [8.5, 25.5]) → no confiable → MN→USD = 17 − 1 = 16.
    const r = resolveDirectionalTcs(17, 99, null, 1);
    expect(r.tc_mn_a_usd).toBe(16);
    expect(r.tc_usd_a_mn).toBe(18);
  });

  it('honra un override plausible de tc_mn_a_usd en su dirección', () => {
    // 16.4 dentro de banda → se respeta para MN→USD; USD→MN deriva 17 + 1 = 18.
    const r = resolveDirectionalTcs(17, 16.4, null, 1);
    expect(r.tc_mn_a_usd).toBe(16.4);
    expect(r.tc_usd_a_mn).toBe(18);
  });
});
