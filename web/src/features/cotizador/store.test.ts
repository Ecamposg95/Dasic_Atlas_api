/**
 * Tests de regresión del store del cotizador — TC direccional congelado.
 *
 * Bug (2026-08): "no se está considerando la tolerancia al momento de hacer
 * el cambio de moneda". Causa raíz: cotizaciones con `tc_usd_a_mn` no-null
 * persistido (residuo de la era V_03: ef64407 persistía el TC resuelto y
 * backfilleó `tipo_cambio ± 1` en TODAS las filas). Al hidratarlas, el store
 * pasaba ese valor a `resolveDirectionalTcs`, que lo confía si cae dentro de
 * la banda [DOF·0.5, DOF·1.5] — y entonces la tasa de venta queda CONGELADA:
 * ni la tolerancia ni el DOF vigente tienen efecto al convertir moneda.
 *
 * Fix: `hydrateFromOrden` ya NO hidrata los overrides persistidos (siempre
 * null). La tasa de venta se deriva SIEMPRE de DOF + tolerancia_tc, igual que
 * en una cotización nueva, y el siguiente guardado limpia el veneno en DB
 * (serialize manda null → backend persiste null).
 *
 * Convención: cada `expected` está derivado A MANO en el comentario.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCotizador } from './store';
import { resolveDirectionalTcs, lineImporte } from './lib/calc';
import type { OrdenVentaDetail } from './types';

/**
 * Cotización mínima como la devuelve /detalle-json, con el veneno de la era
 * V_03: tc_usd_a_mn = 18.35 congelado (DOF de mayo 17.35 + 1), mientras que
 * el DOF persistido en tipo_cambio es 17.35 y la tolerancia elegida es 0.5.
 */
function mkOrdenEnvenenada(): OrdenVentaDetail {
  return {
    id: 42,
    folio: 'C-2605001',
    estatus: 'COTIZACION',
    cliente_id: 7,
    contacto_id: null,
    moneda: 'MXN',
    tipo_cambio: 17.35,
    tc_mn_a_usd: 16.35, // backfill ef64407: tipo_cambio − 1
    tc_usd_a_mn: 18.35, // backfill ef64407: tipo_cambio + 1 (dentro de banda → antes se confiaba)
    tolerancia_tc: 0.5,
    fecha_creacion: '2026-05-23T00:00:00',
    fecha_vencimiento: '2026-06-07T00:00:00',
    observaciones: null,
    terminos_condiciones: null,
    version: 1,
    detalles: [
      {
        id: 1,
        producto_id: 101,
        servicio_id: null,
        sku_libre: null,
        descripcion_libre: null,
        moneda_origen_linea: 'USD',
        costo_base_linea: 100, // costo nativo en USD
        cantidad: 1,
        utilidad_aplicada: 0,
        descuento_aplicado: 0,
        descuento_proveedor: 0,
        tipo_linea: 'producto_catalogo',
        entrega_min: null,
        entrega_max: null,
        entrega_unidad: null,
        observaciones_linea: null,
        producto: {
          id: 101,
          sku: 'SKU-USD',
          nombre: 'Producto importado',
          moneda_compra: 'USD',
          costo_compra: 100,
        },
        servicio: null,
      },
    ],
  };
}

beforeEach(() => {
  useCotizador.getState().reset();
});

describe('hydrateFromOrden — TC direccional persistido (veneno V_03)', () => {
  it('NO hidrata tc_mn_a_usd / tc_usd_a_mn: quedan null aunque la orden los traiga', () => {
    useCotizador.getState().hydrateFromOrden(mkOrdenEnvenenada());
    const s = useCotizador.getState();
    expect(s.tc).toBe(17.35);
    expect(s.tc_mn_a_usd).toBeNull();
    expect(s.tc_usd_a_mn).toBeNull();
    // La tolerancia persistida SÍ se respeta.
    expect(s.tolerancia_tc).toBe(0.5);
  });

  it('la tasa de venta tras hidratar es DOF + tolerancia, no el override congelado', () => {
    useCotizador.getState().hydrateFromOrden(mkOrdenEnvenenada());
    const s = useCotizador.getState();
    // Mismo cálculo que Cart/TotalsBar/TCMiniTable:
    const tcs = resolveDirectionalTcs(s.tc, s.tc_mn_a_usd, s.tc_usd_a_mn, s.tolerancia_tc);
    // USD→MN: 17.35 + 0.5 = 17.85 — NO 18.35 (el congelado de mayo).
    // MN→USD: 17.35 − 0.5 = 16.85 (modelo direccional: protege en ambas vías).
    expect(tcs.tc_usd_a_mn).toBeCloseTo(17.85, 10);
    expect(tcs.tc_mn_a_usd).toBeCloseTo(16.85, 10);
  });

  it('cambiar la moneda del documento convierte con DOF + tolerancia', () => {
    useCotizador.getState().hydrateFromOrden(mkOrdenEnvenenada());
    // El usuario cambia la moneda del documento a USD (HeaderCotizacion → setMoneda).
    useCotizador.getState().setMoneda('USD');
    const s = useCotizador.getState();
    const tcs = resolveDirectionalTcs(s.tc, s.tc_mn_a_usd, s.tc_usd_a_mn, s.tolerancia_tc);
    const linea = s.cart[0];
    // La línea es USD y el doc ahora es USD → sin conversión:
    // importe = 100 × (1 + 0) × 1 = 100 USD
    expect(lineImporte(linea, s.moneda as 'USD', tcs)).toBeCloseTo(100, 10);
    // De vuelta a MXN: 100 USD × (17.35 + 0.5) = 1785 MXN — con el override
    // congelado (18.35) habría dado 1835, ignorando la tolerancia elegida.
    useCotizador.getState().setMoneda('MXN');
    expect(lineImporte(linea, 'MXN', tcs)).toBeCloseTo(1785, 10);
  });

  it('tolerancia_tc null en la orden (legacy) cae al default 1', () => {
    const orden = { ...mkOrdenEnvenenada(), tolerancia_tc: null };
    useCotizador.getState().hydrateFromOrden(orden);
    const s = useCotizador.getState();
    expect(s.tolerancia_tc).toBe(1);
    const tcs = resolveDirectionalTcs(s.tc, s.tc_mn_a_usd, s.tc_usd_a_mn, s.tolerancia_tc);
    // 17.35 + 1 = 18.35
    expect(tcs.tc_usd_a_mn).toBeCloseTo(18.35, 10);
  });
});

describe('hydrateFromOrden — paneles de detalle abiertos', () => {
  // Guardar invalida ['orden', id] y el detalle se vuelve a pedir, así que
  // `hydrateFromOrden` corre también sobre la cotización que ya se edita. Antes
  // vaciaba `expandedUids` siempre, y por eso guardar cerraba de golpe todos
  // los paneles que el usuario tenía abiertos.
  it('conserva las filas expandidas al re-hidratar la MISMA orden', () => {
    const orden = mkOrdenEnvenenada();          // id 42
    useCotizador.getState().hydrateFromOrden(orden);
    useCotizador.getState().toggleExpand('linea-0');
    expect(useCotizador.getState().expandedUids.has('linea-0')).toBe(true);

    useCotizador.getState().hydrateFromOrden(orden);   // refetch tras guardar

    expect(useCotizador.getState().expandedUids.has('linea-0')).toBe(true);
  });

  it('las limpia al hidratar una orden DISTINTA', () => {
    useCotizador.getState().hydrateFromOrden(mkOrdenEnvenenada());
    useCotizador.getState().toggleExpand('linea-0');

    // Otra cotización: los uids son posicionales (`linea-<idx>`), así que
    // conservarlos apuntaría a líneas ajenas.
    useCotizador.getState().hydrateFromOrden({ ...mkOrdenEnvenenada(), id: 43 });

    expect(useCotizador.getState().expandedUids.size).toBe(0);
  });
});
