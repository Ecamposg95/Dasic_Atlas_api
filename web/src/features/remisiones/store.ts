import { create } from 'zustand';
import type { Producto, Servicio } from '@/features/cotizador/types';
import type { FantasmaPrevio } from '@/features/cotizador/hooks/useFantasmasSearch';
import type { RemisionBorrador } from './types';

export type RemisionLinea = {
  uid: string;
  detalle_orden_id: number | null;   // null = ad-hoc (catálogo/fantasma)
  tipo: 'producto' | 'producto_fantasma' | 'servicio_catalogo';
  descripcion: string;
  sku: string | null;
  clave_unidad_sat: string | null;
  unidad: string | null;
  precio_unitario: number;
  productCurrency: string;
  cantidad: number;
  cantidad_max: number | null;       // tope para líneas de orden
  observaciones_linea: string;
  expanded: boolean;
};

type RemisionState = {
  ordenId: number | null;
  ordenFolio: string | null;
  clienteNombre: string | null;
  modo: 'orden' | 'libre';
  clienteId: number | null;
  moneda: string;
  lineas: RemisionLinea[];
  mostrarPrecios: boolean;
  transportista: string;
  observaciones: string;

  hydrateFromBorrador: (b: RemisionBorrador, ordenId: number) => void;
  setQty: (uid: string, qty: number) => void;
  removeLinea: (uid: string) => void;
  toggleExpand: (uid: string) => void;
  setMostrarPrecios: (v: boolean) => void;
  setTransportista: (v: string) => void;
  setObservaciones: (v: string) => void;
  setMoneda: (v: string) => void;
  setPrecio: (uid: string, precio: number) => void;
  hydrateLibre: (cliente: { id: number; nombre: string }) => void;
  addProductoCatalogo: (p: Producto, qty: number) => void;
  addServicio: (s: Servicio, qty: number) => void;
  addFantasma: (f: FantasmaPrevio, qty: number) => void;
  addFantasmaManual: (input: { descripcion: string; sku: string | null; precio_unitario: number; clave_unidad_sat: string | null; cantidad: number }) => void;
  reset: () => void;
};

let _uid = 0;
const nextUid = (prefix: string) => `${prefix}-${_uid++}`;

const initial = {
  ordenId: null,
  ordenFolio: null,
  clienteNombre: null,
  modo: 'orden' as const,
  clienteId: null,
  moneda: 'MXN',
  lineas: [] as RemisionLinea[],
  mostrarPrecios: false,
  transportista: '',
  observaciones: '',
};

export const useRemision = create<RemisionState>((set) => ({
  ...initial,

  hydrateFromBorrador: (b, ordenId) =>
    set({
      ordenId,
      modo: 'orden' as const,
      clienteId: null,
      ordenFolio: b.orden_folio,
      clienteNombre: b.cliente_nombre,
      moneda: b.moneda || 'MXN',
      lineas: b.lineas.map((l) => ({
        uid: nextUid('orden'),
        detalle_orden_id: l.detalle_orden_id,
        tipo: 'producto' as const,
        descripcion: l.descripcion,
        sku: l.sku,
        clave_unidad_sat: l.clave_unidad_sat,
        unidad: l.unidad,
        precio_unitario: l.precio_unitario,
        productCurrency: b.moneda || 'MXN',
        cantidad: l.cantidad_orden,
        cantidad_max: l.cantidad_orden,
        observaciones_linea: '',
        expanded: false,
      })),
    }),

  setQty: (uid, qty) =>
    set((s) => ({
      lineas: s.lineas.map((l) =>
        l.uid === uid
          ? { ...l, cantidad: Math.max(0, l.cantidad_max != null ? Math.min(qty, l.cantidad_max) : qty) }
          : l,
      ),
    })),
  removeLinea: (uid) => set((s) => ({ lineas: s.lineas.filter((l) => l.uid !== uid) })),
  toggleExpand: (uid) =>
    set((s) => ({ lineas: s.lineas.map((l) => (l.uid === uid ? { ...l, expanded: !l.expanded } : l)) })),
  setMostrarPrecios: (v) => set({ mostrarPrecios: v }),
  setTransportista: (v) => set({ transportista: v }),
  setObservaciones: (v) => set({ observaciones: v }),
  setMoneda: (v) => set({ moneda: v }),
  setPrecio: (uid, precio) =>
    set((s) => ({
      lineas: s.lineas.map((l) => (l.uid === uid ? { ...l, precio_unitario: Math.max(0, precio) } : l)),
    })),
  hydrateLibre: (cliente) =>
    set({
      modo: 'libre',
      ordenId: null,
      ordenFolio: null,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      lineas: [],
    }),

  addProductoCatalogo: (p, qty) =>
    set((s) => ({
      lineas: [
        ...s.lineas,
        {
          uid: nextUid('cat'),
          detalle_orden_id: null,
          tipo: 'producto' as const,
          descripcion: p.nombre,
          sku: p.sku_comercial || p.sku,
          clave_unidad_sat: null,
          unidad: null,
          // El catálogo es cost-first (no hay precio de venta); NO sembramos el
          // costo de DASIC como precio al cliente. Arranca en 0 → el usuario lo
          // captura si va a mostrar precios.
          precio_unitario: 0,
          productCurrency: p.moneda_compra || 'MXN',
          cantidad: qty,
          cantidad_max: null,
          observaciones_linea: '',
          expanded: false,
        },
      ],
    })),
  addServicio: (svc, qty) =>
    set((s) => ({
      lineas: [
        ...s.lineas,
        {
          uid: nextUid('srv'),
          detalle_orden_id: null,
          tipo: 'servicio_catalogo' as const,
          descripcion: svc.nombre,
          sku: svc.codigo,
          clave_unidad_sat: null,
          unidad: null,
          precio_unitario: 0,
          productCurrency: (svc.moneda || 'MXN').toUpperCase(),
          cantidad: qty,
          cantidad_max: null,
          observaciones_linea: '',
          expanded: false,
        },
      ],
    })),
  addFantasma: (f, qty) =>
    set((s) => ({
      lineas: [
        ...s.lineas,
        {
          uid: nextUid('fan'),
          detalle_orden_id: null,
          tipo: 'producto_fantasma' as const,
          descripcion: f.descripcion,
          sku: f.sku_libre || null,
          clave_unidad_sat: null,
          unidad: null,
          precio_unitario: 0,
          productCurrency: (f.moneda || 'MXN').toUpperCase(),
          cantidad: qty,
          cantidad_max: null,
          observaciones_linea: '',
          expanded: false,
        },
      ],
    })),
  addFantasmaManual: (input) =>
    set((s) => ({
      lineas: [
        ...s.lineas,
        {
          uid: nextUid('fanm'),
          detalle_orden_id: null,
          tipo: 'producto_fantasma' as const,
          descripcion: input.descripcion,
          sku: input.sku,
          clave_unidad_sat: input.clave_unidad_sat,
          unidad: null,
          precio_unitario: input.precio_unitario,
          productCurrency: 'MXN',
          cantidad: input.cantidad,
          cantidad_max: null,
          observaciones_linea: '',
          expanded: false,
        },
      ],
    })),
  reset: () => set({ ...initial, lineas: [] }),
}));
