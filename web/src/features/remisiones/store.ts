import { create } from 'zustand';
import type { Producto, Servicio } from '@/features/cotizador/types';
import type { FantasmaPrevio } from '@/features/cotizador/hooks/useFantasmasSearch';
import type { RemisionBorrador, RemisionDetalle, RemisionEstado } from './types';

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
  // Vestigial — ya no se usa para topar `cantidad` (ver `setQty`: la
  // sobre-entrega la decide el backend, la UI solo avisa). Ad-hoc siempre
  // null; líneas de orden también van en null (el tope visual vive en
  // `pendiente`, mostrado en la tabla de selección de partidas).
  cantidad_max: number | null;
  cotizado: number | null;           // snapshot cantidad_orden — solo líneas de orden
  entregado: number | null;          // acumulado ya entregado — solo líneas de orden
  pendiente: number | null;          // cotizado - entregado — solo líneas de orden
  incluir: boolean;                  // checkbox de selección (líneas de orden); ad-hoc siempre true
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
  // Documento en edición: id del borrador persistido en backend (null =
  // aún no guardado) y su estado. Solo los borradores son editables, así
  // que `estadoDoc` es 'borrador' mientras haya `editingId`.
  editingId: number | null;
  estadoDoc: RemisionEstado | null;

  // Conmuta orden ⇄ libre en runtime. Cambiar de modo limpia el documento
  // (líneas, orden/cliente, borrador cargado); mismo modo = no-op.
  setModo: (modo: 'orden' | 'libre') => void;
  // Carga la orden seleccionada usando el borrador que devuelve
  // GET /api/remisiones/orden/{id}/borrador (alias claro de
  // hydrateFromBorrador — el draft ya trae orden_venta_id).
  cargarOrden: (draft: RemisionBorrador) => void;
  // Marca el borrador persistido (tras POST /api/remisiones/) o lo limpia.
  setEditingId: (id: number | null) => void;
  hydrateFromBorrador: (b: RemisionBorrador, ordenId: number) => void;
  // Reabre un borrador existente para editarlo (GET /api/remisiones/{id}).
  // `borrador` es el contexto de acumulados de la orden (GET /orden/{id}/
  // borrador), null en modo libre — sin él no hay cotizado/entregado/
  // pendiente que mostrar en la tabla de selección de partidas.
  hydrateFromDetalle: (detalle: RemisionDetalle, borrador: RemisionBorrador | null) => void;
  setQty: (uid: string, qty: number) => void;
  setUnidad: (uid: string, unidad: string) => void;
  toggleIncluir: (uid: string) => void;
  seleccionarTodasPartidas: () => void;
  limpiarSeleccionPartidas: () => void;
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
  editingId: null as number | null,
  estadoDoc: null as RemisionEstado | null,
};

export const useRemision = create<RemisionState>((set, get) => ({
  ...initial,

  setModo: (modo) =>
    set((s) => (s.modo === modo ? {} : { ...initial, modo, lineas: [] })),

  cargarOrden: (draft) => get().hydrateFromBorrador(draft, draft.orden_venta_id),

  setEditingId: (id) =>
    set({ editingId: id, estadoDoc: id != null ? ('borrador' as const) : null }),

  hydrateFromBorrador: (b, ordenId) =>
    set({
      ordenId,
      editingId: null,
      estadoDoc: null,
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
        // Default = pendiente (NO cantidad_orden): lo normal es remisionar
        // lo que falta, no repetir todo lo cotizado.
        cantidad: l.cantidad_pendiente,
        cantidad_max: null,
        cotizado: l.cantidad_orden,
        entregado: l.entregado,
        pendiente: l.cantidad_pendiente,
        // Partidas ya completamente entregadas arrancan sin marcar — el
        // usuario las incluye a propósito si de verdad quiere sobre-entregar.
        incluir: l.cantidad_pendiente > 0,
        observaciones_linea: '',
        expanded: false,
      })),
    }),

  hydrateFromDetalle: (detalle, borrador) =>
    set(() => {
      const existentesPorPartida = new Map(
        detalle.detalles
          .filter((d) => d.detalle_orden_id != null)
          .map((d) => [d.detalle_orden_id as number, d]),
      );
      const adHoc = detalle.detalles.filter((d) => d.detalle_orden_id == null);
      const moneda = detalle.moneda || borrador?.moneda || 'MXN';
      const modo: 'orden' | 'libre' = detalle.orden_venta_id != null ? 'orden' : 'libre';

      const lineasOrden: RemisionLinea[] = (borrador?.lineas ?? []).map((l) => {
        const existente = existentesPorPartida.get(l.detalle_orden_id);
        return {
          uid: nextUid('orden'),
          detalle_orden_id: l.detalle_orden_id,
          tipo: 'producto' as const,
          descripcion: l.descripcion,
          sku: l.sku,
          clave_unidad_sat: existente?.clave_unidad_sat ?? l.clave_unidad_sat,
          unidad: existente?.unidad ?? l.unidad,
          precio_unitario: l.precio_unitario,
          productCurrency: moneda,
          cantidad: existente ? Number(existente.cantidad) : l.cantidad_pendiente,
          cantidad_max: null,
          cotizado: l.cantidad_orden,
          entregado: l.entregado,
          pendiente: l.cantidad_pendiente,
          incluir: existente != null,
          observaciones_linea: existente?.observaciones_linea ?? '',
          expanded: false,
        };
      });

      const lineasAdHoc: RemisionLinea[] = adHoc.map((d) => ({
        uid: nextUid('adhoc'),
        detalle_orden_id: null,
        tipo: 'producto_fantasma' as const,
        descripcion: d.descripcion ?? '',
        sku: d.sku,
        clave_unidad_sat: d.clave_unidad_sat,
        unidad: d.unidad,
        precio_unitario: d.precio_unitario ?? 0,
        productCurrency: moneda,
        cantidad: Number(d.cantidad),
        cantidad_max: null,
        cotizado: null,
        entregado: null,
        pendiente: null,
        incluir: true,
        observaciones_linea: d.observaciones_linea ?? '',
        expanded: false,
      }));

      return {
        editingId: detalle.id,
        estadoDoc: detalle.estado,
        ordenId: detalle.orden_venta_id,
        ordenFolio: detalle.orden_folio,
        clienteNombre: detalle.cliente_nombre,
        modo,
        clienteId: null, // PUT no manda cliente_id — es inmutable tras crear
        moneda,
        lineas: [...lineasOrden, ...lineasAdHoc],
        mostrarPrecios: detalle.mostrar_precios,
        transportista: detalle.transportista || '',
        observaciones: detalle.observaciones || '',
      };
    }),

  // Sin tope: la sobre-entrega la decide el backend en /emitir (400 con
  // detalle de excesos) — la UI solo avisa con un badge (ver
  // PartidasSeleccionTable), nunca bloquea el input.
  setQty: (uid, qty) =>
    set((s) => ({
      lineas: s.lineas.map((l) => (l.uid === uid ? { ...l, cantidad: Math.max(0, qty) } : l)),
    })),
  setUnidad: (uid, unidad) =>
    set((s) => ({ lineas: s.lineas.map((l) => (l.uid === uid ? { ...l, unidad } : l)) })),
  toggleIncluir: (uid) =>
    set((s) => ({ lineas: s.lineas.map((l) => (l.uid === uid ? { ...l, incluir: !l.incluir } : l)) })),
  seleccionarTodasPartidas: () =>
    set((s) => ({
      lineas: s.lineas.map((l) => (l.detalle_orden_id != null ? { ...l, incluir: true } : l)),
    })),
  limpiarSeleccionPartidas: () =>
    set((s) => ({
      lineas: s.lineas.map((l) => (l.detalle_orden_id != null ? { ...l, incluir: false } : l)),
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
      editingId: null,
      estadoDoc: null,
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
          cotizado: null,
          entregado: null,
          pendiente: null,
          incluir: true,
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
          cotizado: null,
          entregado: null,
          pendiente: null,
          incluir: true,
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
          cotizado: null,
          entregado: null,
          pendiente: null,
          incluir: true,
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
          cotizado: null,
          entregado: null,
          pendiente: null,
          incluir: true,
          observaciones_linea: '',
          expanded: false,
        },
      ],
    })),
  reset: () => set({ ...initial, lineas: [] }),
}));
