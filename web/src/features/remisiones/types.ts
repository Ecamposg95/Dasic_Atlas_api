// Tipos para la feature de Remisiones — refleja los responses del router v2
// (`app/domains/remisiones/router.py`, Task 7) y de
// GET /api/ventas/{id}/avance-entrega (`app/routers/ventas.py`).

export type RemisionEstado = 'borrador' | 'emitida' | 'recibida' | 'cancelada';

export type RemisionItem = {
  id: number;
  // null en borrador — el folio se asigna al emitir.
  folio: string | null;
  orden_venta_id: number | null;
  orden_folio: string | null;
  cliente_nombre: string | null;
  fecha_remision: string | null;
  transportista: string | null;
  recibido_por: string | null;
  recibido_at: string | null;
  estado: RemisionEstado;
  creado_por_id: number;
  lineas_count: number;
};

export type RemisionDetalleLine = {
  id: number;
  detalle_orden_id: number | null;
  descripcion: string | null;
  sku: string | null;
  cantidad: number;
  unidad: string | null;
  observaciones_linea: string | null;
  clave_unidad_sat: string | null;
  precio_unitario: number | null;
  subtotal: number | null;
};

// GET /api/remisiones/{id} → _detalle() = {..._item(), observaciones, moneda,
// mostrar_precios, motivo_cancelacion, detalles}
export type RemisionDetalle = RemisionItem & {
  observaciones: string | null;
  moneda: string | null;
  mostrar_precios: boolean;
  motivo_cancelacion: string | null;
  detalles: RemisionDetalleLine[];
};

export type RemisionesResponse = {
  page: number;
  page_size: number;
  total: number;
  items: RemisionItem[];
};

// Respuesta compartida por POST /, PUT /{id} y POST /{id}/cancelar — todas
// devuelven {id, estado} sin folio (el folio solo lo asigna /emitir).
export type RemisionEstadoResponse = {
  id: number;
  estado: RemisionEstado;
};

// POST /api/remisiones/{id}/emitir
export type RemisionEmitirResponse = {
  id: number;
  folio: string;
  estado: RemisionEstado;
};

// PATCH /api/remisiones/{id}/recepcion
export type RecepcionResponse = {
  id: number;
  estado: RemisionEstado;
  recibido_por: string;
  recibido_at: string | null;
};

// POST /api/remisiones/{id}/crear-cotizacion
export type RemisionCrearCotizacionResponse = {
  orden_venta_id: number;
  folio: string;
};

// Borrador devuelto por GET /api/remisiones/orden/{id}/borrador
export type RemisionBorradorLinea = {
  detalle_orden_id: number;
  descripcion: string;
  sku: string | null;
  clave_unidad_sat: string | null;
  unidad: string | null;
  precio_unitario: number;
  cantidad_orden: number;
  entregado: number;
  cantidad_pendiente: number;
};

export type RemisionBorrador = {
  orden_venta_id: number;
  orden_folio: string | null;
  cliente_nombre: string | null;
  moneda: string | null;
  lineas: RemisionBorradorLinea[];
};

// Línea editable en la página de creación (estado local).
export type RemisionLineaEdit = {
  // Para líneas de orden: el id del DetalleOrden. Para fantasma ad-hoc: null.
  detalle_orden_id: number | null;
  incluir: boolean;
  descripcion: string;
  sku: string | null;
  clave_unidad_sat: string | null;
  precio_unitario: number;
  cantidad: number;
  cantidad_max: number | null; // null para fantasma ad-hoc (sin tope)
  observaciones_linea: string;
};

// Payload de línea de POST /api/remisiones/ y PUT /api/remisiones/{id}
// (DetalleRemisionInput — `cantidad: Decimal` admite decimales).
export type RemisionDetalleInput = {
  detalle_orden_id: number | null;
  descripcion: string;
  sku: string | null;
  cantidad: number;
  unidad: string | null;
  observaciones_linea: string | null;
  clave_unidad_sat: string | null;
  precio_unitario: number | null;
};

// POST /api/remisiones/ — crea BORRADOR (sin folio).
export type RemisionCreatePayload = {
  orden_venta_id: number | null;
  cliente_id: number | null;
  moneda: string | null;
  transportista: string | null;
  observaciones: string | null;
  mostrar_precios: boolean;
  detalles: RemisionDetalleInput[];
};

// PUT /api/remisiones/{id} — solo borrador. `detalles: null` = no tocar
// líneas (RemisionUpdate del backend).
export type RemisionUpdatePayload = {
  transportista?: string | null;
  observaciones?: string | null;
  mostrar_precios?: boolean;
  moneda?: string | null;
  detalles?: RemisionDetalleInput[] | null;
};

export type RemisionCancelarPayload = {
  motivo: string;
};

export type ClienteLite = {
  id: number;
  nombre_empresa: string;
  rfc_tax_id: string | null;
  email: string | null;
};

// Item de /api/ventas/historial usado en el selector de orden.
// El backend devuelve `cliente` (nombre de empresa), no `cliente_nombre`.
export type OrdenHistorialItem = {
  id: number;
  folio: string;
  estatus: string;
  cliente?: string | null;
};

// GET /api/ventas/{id}/avance-entrega — acumulado cotizado/entregado/
// pendiente por partida + historial de remisiones de la orden.
export type AvancePartidaEstado = 'NO_ENTREGADA' | 'PARCIAL' | 'ENTREGADA';

export type AvancePartida = {
  detalle_orden_id: number;
  cotizado: number;
  entregado: number;
  pendiente: number;
  estado: AvancePartidaEstado;
};

export type AvanceRemisionItem = {
  id: number;
  folio: string | null;
  fecha: string | null;
  estado: RemisionEstado;
};

export type AvanceEntregaResponse = {
  partidas: AvancePartida[];
  remisiones: AvanceRemisionItem[];
};

// POST /api/remisiones/{id}/emitir → 400 estructurado cuando hay partidas
// que exceden lo pendiente y el usuario no tiene permiso de sobre-entrega
// (`service.emitir`, app/domains/remisiones/service.py). Los campos
// numéricos llegan como string (Decimal serializado con `str()`).
export type ExcesoPartida = {
  detalle_orden_id: number;
  cotizado: string;
  pendiente: string;
  solicitado: string;
};

export type EmitirErrorDetail = {
  mensaje: string;
  excesos: ExcesoPartida[];
};

// Error tipado de `useEmitir` — a diferencia de `ApiError` (lib/api.ts), NO
// pasa `detail` por `normalizeDetail`: preserva el objeto {mensaje, excesos}
// para que la UI muestre el desglose por partida en vez de un string opaco.
export type RemisionEmitirError = {
  status: number;
  detail: EmitirErrorDetail | string;
};
