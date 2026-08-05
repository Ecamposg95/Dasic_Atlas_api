import { describe, expect, it } from 'vitest';
import { qtyAlEscribir, qtyAlSalir } from './useQtyDraft';

const ENTEROS = { decimal: false, limit: null };
const DECIMALES = { decimal: true, limit: null };

describe('qtyAlEscribir — mientras se teclea', () => {
  it('no propaga el campo vacío (era el bug: se volvía 1 y no se podía reteclear)', () => {
    expect(qtyAlEscribir('', ENTEROS)).toBeNull();
  });

  it('no propaga un "0." a medio escribir con decimales activos', () => {
    // Tecleando "0.5": tras el "0" el valor saltaba a 0.001 y el usuario
    // terminaba con un número que no puso.
    expect(qtyAlEscribir('0', DECIMALES)).toBeNull();
    expect(qtyAlEscribir('0.', DECIMALES)).toBeNull();
    expect(qtyAlEscribir('0.5', DECIMALES)).toBe(0.5);
  });

  it('no propaga texto que no es número', () => {
    expect(qtyAlEscribir('-', ENTEROS)).toBeNull();
    expect(qtyAlEscribir('abc', ENTEROS)).toBeNull();
  });

  it('no propaga por debajo del mínimo', () => {
    expect(qtyAlEscribir('0', ENTEROS)).toBeNull();
    expect(qtyAlEscribir('-3', ENTEROS)).toBeNull();
  });

  it('no propaga por encima del tope disponible', () => {
    // 7 es válido con tope 10; 11 no, y se queda solo en el borrador hasta
    // que el usuario salga del campo (donde se recorta).
    expect(qtyAlEscribir('7', { decimal: false, limit: 10 })).toBe(7);
    expect(qtyAlEscribir('11', { decimal: false, limit: 10 })).toBeNull();
  });

  it('propaga un entero válido', () => {
    expect(qtyAlEscribir('25', ENTEROS)).toBe(25);
  });

  it('trunca decimales cuando la línea no los admite', () => {
    // parseInt('2.9') = 2: una línea de catálogo sin fracciones no debe
    // recibir 2.9 y reventar después en el guard de stock del backend.
    expect(qtyAlEscribir('2.9', ENTEROS)).toBe(2);
  });
});

describe('qtyAlSalir — al abandonar el campo', () => {
  it('el campo vacío cae al mínimo', () => {
    expect(qtyAlSalir('', ENTEROS)).toBe(1);
    expect(qtyAlSalir('', DECIMALES)).toBe(0.001);
  });

  it('la basura cae al mínimo', () => {
    expect(qtyAlSalir('abc', ENTEROS)).toBe(1);
  });

  it('sube al mínimo lo que quedó por debajo', () => {
    expect(qtyAlSalir('0', ENTEROS)).toBe(1);
    expect(qtyAlSalir('-4', ENTEROS)).toBe(1);
  });

  it('recorta al tope disponible', () => {
    expect(qtyAlSalir('11', { decimal: false, limit: 10 })).toBe(10);
  });

  it('deja intacto un valor válido', () => {
    expect(qtyAlSalir('7', { decimal: false, limit: 10 })).toBe(7);
    expect(qtyAlSalir('0.25', DECIMALES)).toBe(0.25);
  });
});
