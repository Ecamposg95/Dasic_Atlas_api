// Primitivas de documento compartidas entre Cotizador y Remisión.
// Estos tipos son PRESENTACIONALES: ya vienen calculados desde el adaptador
// (el cotizador computa TC/importe/costoOc con su store; la remisión pasa
// valores simples). DocumentRow NO lee ningún store.

export type DocLineTipo = 'producto' | 'producto_fantasma' | 'servicio_catalogo';

/** Qué celdas/controles renderiza la fila. Cotización = todo; Remisión = reducido. */
export type DocRowCaps = {
  showCosto: boolean;     // celda Orig + OC
  showUtilidad: boolean;  // input % util
  showDescuento: boolean; // input % desc
  showEntrega: boolean;   // inputs entrega min/max/unidad
  showImporte: boolean;   // celda importe (remisión: solo si mostrarPrecios)
  editableQty: boolean;   // input cantidad editable
  editablePrecio?: boolean; // input precio unitario por línea (solo remisión)
  showUnidad?: boolean;    // dropdown de unidad editable (solo remisión, líneas ad-hoc)
  unidadOptions?: string[]; // opciones del catálogo activo cuando showUnidad
  decimalQty?: boolean;    // cantidad admite decimales (remisión: metros/kg/etc.); default = solo enteros (cotizador)
};

/** View-model ya calculado de una línea. */
export type DocRowVM = {
  uid: string;
  tipo: DocLineTipo;
  sku: string;
  nom: string;

  // Badges
  productCurrency: string;     // 'MXN' | 'USD'
  monedaDocumento: string;     // moneda de la cotización/remisión
  toleranciaTc?: number;       // para el title del badge de conversión
  esOverride?: boolean;        // chip "Editado" (solo catálogo)
  stockMax?: number | null;    // para StockBadge; null/undefined => no badge

  // Cantidad
  qty: number;
  qtyMax?: number | null;      // cap parcial (remisión). null/undefined => sin tope

  // Costo (solo si caps.showCosto)
  costOrigen: number;          // crudo del catálogo, moneda nativa
  costoOc: number;             // valor mostrado en la columna COSTO; el productor lo define:
                               // cotizador = PRECIO UNITARIO = costo convertido (TC venta DOF+tol) × (1+util);
                               // el costo OC real (DOF puro, neto descProv) vive en RowExpanded

  // Util / Desc / Entrega (solo si sus caps)
  utilidad: number;
  descuento: number;
  entrega_min: number | null;
  entrega_max: number | null;
  entrega_unidad: 'dias' | 'semanas' | null;

  // Importe (solo si caps.showImporte)
  importe: number;
  precioUnitario?: number;

  unidad?: string | null;      // valor del dropdown de unidad (solo si caps.showUnidad)

  tieneNota?: boolean;         // chip/icono de nota de línea (solo cotizador)

  expanded: boolean;
};

export type DocRowCallbacks = {
  onQty: (uid: string, qty: number) => void;
  onUtilidad?: (uid: string, v: number) => void;
  onDescuento?: (uid: string, v: number) => void;
  onEntrega?: (
    uid: string,
    patch: {
      entrega_min?: number | null;
      entrega_max?: number | null;
      entrega_unidad?: 'dias' | 'semanas' | null;
    },
  ) => void;
  onRemove: (uid: string) => void;
  onEdit?: (uid: string) => void;       // abre modal de edición (opcional)
  onToggleExpand: (uid: string) => void;
  onPrecio?: (uid: string, v: number) => void;
  onUnidad?: (uid: string, unidad: string) => void;
};
