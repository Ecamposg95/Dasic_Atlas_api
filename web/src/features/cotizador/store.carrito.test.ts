import { beforeEach, describe, expect, it } from 'vitest';
import { useCotizador } from './store';
import type { Producto, Servicio } from './types';

/**
 * Reglas del carrito: qué se fusiona, qué no, y qué pasa al mover líneas.
 *
 * La fusión es la regla con más filo: dos veces el MISMO producto de catálogo
 * se suman en una línea, pero dos fantasmas nunca —aunque se llamen igual—,
 * porque cada uno es una partida distinta que el vendedor capturó a mano y
 * puede tener costo, proveedor o marca diferentes. Fusionarlos perdería una.
 *
 * Va en `node`, sin jsdom: es lógica de estado, no de render.
 */
const carrito = () => useCotizador.getState().cart;

function mkProducto(over: Partial<Producto> = {}): Producto {
  return {
    id: 1,
    sku: 'CBL-01',
    sku_comercial: null,
    nombre: 'Cable calibre 12',
    marca: 'Condumex',
    costo_compra: 100,
    moneda_compra: 'MXN',
    stock_actual: 50,
    ...over,
  };
}

function mkServicio(over: Partial<Servicio> = {}): Servicio {
  return {
    id: 1,
    codigo: 'SRV-01',
    nombre: 'Instalación',
    costo_base: 500,
    moneda: 'MXN',
    ...over,
  } as Servicio;
}

beforeEach(() => {
  useCotizador.getState().reset();
});

describe('agregar al carrito', () => {
  it('el mismo producto de catálogo se fusiona sumando cantidades', () => {
    const p = mkProducto();
    useCotizador.getState().addProducto(p, 2);
    useCotizador.getState().addProducto(p, 3);

    expect(carrito()).toHaveLength(1);
    expect(carrito()[0].qty).toBe(5); // 2 + 3
  });

  it('productos distintos son líneas distintas', () => {
    useCotizador.getState().addProducto(mkProducto({ id: 1, sku: 'A' }), 1);
    useCotizador.getState().addProducto(mkProducto({ id: 2, sku: 'B' }), 1);

    expect(carrito()).toHaveLength(2);
  });

  it('dos fantasmas NUNCA se fusionan, aunque describan lo mismo', () => {
    // Cada fantasma es una partida capturada a mano: puede llevar costo,
    // proveedor o marca distintos. Fusionarlos perdería una de las dos.
    const adhoc = { descripcion: 'Tornillo especial', costo: 10, moneda: 'MXN' as const };
    useCotizador.getState().addLineaAdhoc(adhoc);
    useCotizador.getState().addLineaAdhoc(adhoc);

    expect(carrito()).toHaveLength(2);
    expect(carrito()[0].uid).not.toBe(carrito()[1].uid);
  });

  it('un fantasma no se fusiona con un producto de catálogo', () => {
    useCotizador.getState().addProducto(mkProducto(), 1);
    useCotizador.getState().addLineaAdhoc({ descripcion: 'Cable calibre 12', costo: 100, moneda: 'MXN' });

    expect(carrito()).toHaveLength(2);
  });

  it('el producto entra con el stock del catálogo como tope', () => {
    useCotizador.getState().addProducto(mkProducto({ stock_actual: 7 }), 1);
    expect(carrito()[0].max).toBe(7);
  });

  it('los servicios no tienen stock', () => {
    useCotizador.getState().addServicio(mkServicio(), 1);
    expect(carrito()[0].max).toBe(0);
    expect(carrito()[0].tipo_linea).toBe('servicio_catalogo');
  });

  it('la utilidad por defecto es 30 y se puede sobreescribir', () => {
    useCotizador.getState().addProducto(mkProducto({ id: 1 }), 1);
    useCotizador.getState().addProducto(mkProducto({ id: 2 }), 1, 12.5);

    expect(carrito()[0].utilidad).toBe(30);
    expect(carrito()[1].utilidad).toBe(12.5);
  });
});

describe('modificar el carrito', () => {
  it('quitar una línea deja intactas las demás', () => {
    useCotizador.getState().addProducto(mkProducto({ id: 1 }), 1);
    useCotizador.getState().addProducto(mkProducto({ id: 2 }), 1);
    const [primera, segunda] = carrito();

    useCotizador.getState().removeLinea(primera.uid);

    expect(carrito()).toHaveLength(1);
    expect(carrito()[0].uid).toBe(segunda.uid);
  });

  it('editar una línea no toca a las otras', () => {
    useCotizador.getState().addProducto(mkProducto({ id: 1 }), 1);
    useCotizador.getState().addProducto(mkProducto({ id: 2 }), 1);
    const [a, b] = carrito();

    useCotizador.getState().updateLinea(a.uid, { qty: 9, descuento: 15 });

    expect(carrito().find((l) => l.uid === a.uid)).toMatchObject({ qty: 9, descuento: 15 });
    expect(carrito().find((l) => l.uid === b.uid)?.qty).toBe(1);
  });

  it('un uid inexistente no altera nada', () => {
    useCotizador.getState().addProducto(mkProducto(), 1);
    const antes = carrito()[0];

    useCotizador.getState().updateLinea('no-existe', { qty: 99 });
    useCotizador.getState().removeLinea('tampoco-existe');

    expect(carrito()).toHaveLength(1);
    expect(carrito()[0].qty).toBe(antes.qty);
  });
});

describe('reordenar líneas', () => {
  function tresLineas() {
    [1, 2, 3].forEach((id) => useCotizador.getState().addProducto(mkProducto({ id, sku: `S${id}` }), 1));
    return carrito().map((l) => l.uid);
  }

  it('mover la primera al final conserva las tres', () => {
    const [a, b, c] = tresLineas();

    useCotizador.getState().reordenarLinea(a, c);

    // `a` se saca de la posición 0 —lo que corre a b y c una a la izquierda—
    // y se inserta en el índice donde estaba c, que ahora es el último.
    expect(carrito().map((l) => l.uid)).toEqual([b, c, a]);
  });

  it('mover la última al principio', () => {
    const [a, , c] = tresLineas();

    useCotizador.getState().reordenarLinea(c, a);

    expect(carrito()[0].uid).toBe(c);
    expect(carrito()).toHaveLength(3);
  });

  it('mover una línea sobre sí misma no cambia el orden', () => {
    const uids = tresLineas();

    useCotizador.getState().reordenarLinea(uids[1], uids[1]);

    expect(carrito().map((l) => l.uid)).toEqual(uids);
  });

  it('un uid inexistente no reordena ni pierde líneas', () => {
    const uids = tresLineas();

    useCotizador.getState().reordenarLinea('fantasma', uids[0]);

    expect(carrito().map((l) => l.uid)).toEqual(uids);
  });
});

describe('paneles de detalle', () => {
  it('toggleExpand abre y cierra la misma fila', () => {
    useCotizador.getState().addProducto(mkProducto(), 1);
    const uid = carrito()[0].uid;

    useCotizador.getState().toggleExpand(uid);
    expect(useCotizador.getState().expandedUids.has(uid)).toBe(true);

    useCotizador.getState().toggleExpand(uid);
    expect(useCotizador.getState().expandedUids.has(uid)).toBe(false);
  });
});

describe('reset', () => {
  it('deja el carrito vacío y sin cotización en edición', () => {
    useCotizador.getState().addProducto(mkProducto(), 1);
    useCotizador.getState().setEditing(42, 'C-2608001');

    useCotizador.getState().reset();

    expect(carrito()).toHaveLength(0);
    expect(useCotizador.getState().editingId).toBeNull();
    expect(useCotizador.getState().expandedUids.size).toBe(0);
  });
});
