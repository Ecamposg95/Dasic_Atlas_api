import { useState } from 'react';

/**
 * Reglas del input de cantidad, separadas del hook para poder probarlas sin
 * jsdom (la suite corre en `node`; ver `web/vitest.config.ts`).
 *
 * El input se corregía en **cada tecla**: `Math.max(min, raw || min)` sobre el
 * `onChange` convierte el campo vacío en `min` de inmediato, así que no se
 * podía borrar para reteclear, y con decimales activos teclear `0.5` era
 * imposible — al escribir el `0` el valor saltaba a `0.001` y el cursor
 * quedaba detrás de un número que el usuario no puso.
 *
 * La corrección separa los dos momentos: **mientras se escribe** el texto se
 * conserva tal cual y solo se propaga cuando ya es un número válido dentro de
 * rango; **al salir del campo** se normaliza. El store nunca ve un valor
 * inválido y el usuario nunca ve el campo pelearse con él.
 */
export type QtyOpts = { decimal: boolean; limit?: number | null };

export function minQty(decimal: boolean): number {
  return decimal ? 0.001 : 1;
}

export function parseQty(texto: string, decimal: boolean): number {
  return decimal ? parseFloat(texto) : parseInt(texto, 10);
}

/**
 * Valor a propagar mientras se teclea, o `null` si el texto todavía no es un
 * número válido dentro de rango (campo vacío, `-` suelto, `0.` a medio
 * escribir, o por encima del tope disponible).
 */
export function qtyAlEscribir(texto: string, { decimal, limit }: QtyOpts): number | null {
  const v = parseQty(texto, decimal);
  if (!Number.isFinite(v)) return null;
  if (v < minQty(decimal)) return null;
  if (limit != null && v > limit) return null;
  return v;
}

/** Valor definitivo al salir del campo: vacío o basura → mínimo, y se recorta al tope. */
export function qtyAlSalir(texto: string, { decimal, limit }: QtyOpts): number {
  const min = minQty(decimal);
  const v = parseQty(texto, decimal);
  if (!Number.isFinite(v)) return min;
  const acotado = Math.max(min, v);
  return limit != null ? Math.min(acotado, limit) : acotado;
}

export function useQtyDraft(opts: {
  /** Cantidad vigente en el store. */
  qty: number;
  /** Si la línea admite fracciones (`caps.decimalQty`). */
  decimal: boolean;
  /** Tope disponible, si lo hay (stock, pendiente por entregar…). */
  limit?: number | null;
  onCommit: (v: number) => void;
}) {
  const { qty, decimal, limit, onCommit } = opts;
  // `null` = no se está editando: manda el valor del store.
  const [draft, setDraft] = useState<string | null>(null);

  return {
    value: draft ?? String(qty),

    onChange(e: React.ChangeEvent<HTMLInputElement>) {
      const texto = e.target.value;
      setDraft(texto);
      const v = qtyAlEscribir(texto, { decimal, limit });
      if (v != null) onCommit(v);
    },

    onBlur() {
      const texto = draft ?? '';
      setDraft(null);
      onCommit(qtyAlSalir(texto, { decimal, limit }));
    },
  };
}
