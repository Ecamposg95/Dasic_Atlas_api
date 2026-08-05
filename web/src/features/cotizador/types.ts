// Tipos del cotizador. Subset curado de los DTOs del backend; reflejan solo
// lo que el MVP usa. Cuando los endpoints cambien, los regeneramos con
// `npm run types:gen` y comparamos contra esto.

export type Producto = {
  id: number;
  sku: string;
  sku_comercial: string | null;
  nombre: string;
  marca: string | null;
  // Texto libre (no FK); el backend la expone para filtros client-side
  // mientras `/api/productos` no acepte `categoria_id` como query param.
  categoria?: string | null;
  costo_compra: number;
  moneda_compra: 'MXN' | 'USD';
  stock_actual: number;
  // FK al proveedor principal del catálogo. Lo usa el Preview OC para
  // agrupar líneas de catálogo por proveedor sugerido en el cart. El
  // backend (`ProductoBase`) ya lo expone en `/api/productos`.
  proveedor_principal_id?: number | null;
};

// Subset curado de `ServicioResponse` (app/schemas/services.py:47). El SPA
// solo lee los campos que necesita para agregar al cart; los SAT/clave_unidad
// se respetan en backend.
export type Servicio = {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  categoria_servicio?: string | null;
  costo: number | string;
  moneda: string;
  activo?: boolean;
};

export type Cliente = {
  id: number;
  nombre_empresa: string;
  contacto_nombre: string | null;
  rfc_tax_id: string | null;
  email: string | null;
};

export type CotizadorConfig = {
  iva_rate: number;
  iva_pct_label: string;
  quote_validity_days: number;
  // TODO(backend): `app/routers/ventas.py:104` no devuelve aún el default de
  // términos. Cuando se agregue, el modal de Términos hará el "Restaurar default"
  // útil. Mientras tanto queda como string vacío.
  terminos_condiciones_default?: string;
};

export type Moneda = 'MXN' | 'USD';
export type EntregaUnidad = 'dias' | 'semanas' | null;

// Tipo de línea — corresponde al `_resolve_tipo_linea` del backend
// (`app/routers/ventas.py:48`). 'servicio' ad-hoc legacy todavía no entra al
// cart. 'producto_fantasma' entra desde 2026-05-23 y 'servicio_catalogo'
// desde 2026-05-23 (mismo día).
export type TipoLinea = 'producto_catalogo' | 'producto_fantasma' | 'servicio_catalogo';

export type CartItem = {
  // UID local para keying en React. Si la línea viene del backend, usamos
  // `linea-<detalle_id>`. Si se agregó en sesión, `nuevo-<id-producto>-<random>`
  // o `fantasma-<random>` o `servicio-<id>-<random>`.
  uid: string;

  // Distingue catálogo / fantasma / servicio_catalogo. Default 'producto_catalogo'.
  tipo_linea: TipoLinea;

  // Catálogo: ID del Producto. NULL si tipo_linea != 'producto_catalogo'.
  producto_id: number | null;

  // Servicio del catálogo (tabla servicios). NULL salvo cuando
  // tipo_linea === 'servicio_catalogo'.
  servicio_id: number | null;

  // Snapshot del catálogo al agregar — usado para detectar overrides en
  // productos del catálogo. Para fantasmas: sku_original/nom_original son ''
  // y cost_original = 0; el chip 'Editado' no aplica.
  sku: string;
  nom: string;
  cost: number;
  productCurrency: Moneda;
  sku_original: string;
  nom_original: string;
  cost_original: number;
  max: number; // stock_actual al momento de agregar (puede quedar stale)

  // Solo para fantasmas: proveedor sugerido (opcional al crear, pero
  // necesario para que sugerir-oc agrupe la línea con su proveedor real).
  proveedor_sugerido_id?: number | null;

  // Solo para fantasmas (US-008): marca + claves SAT + notas del fantasma.
  // Alimentan el upsert del pool y el snapshot SAT de la línea. snake_case
  // para alinear con los demás campos ad-hoc.
  marca?: string | null;
  marca_id?: number | null;
  clave_prod_serv?: string | null;
  clave_unidad_sat?: string | null;
  observaciones?: string | null;

  // US-013/014: checkbox por producto que decide si la marca sale en el PDF.
  // marca arriba aplica también a catálogo (snapshot de Producto.marca).
  mostrar_marca?: boolean;

  // Campos editables por el usuario:
  qty: number;
  utilidad: number;             // 0-99 (porcentaje)
  descuento: number;            // 0-100 (porcentaje) — descuento al CLIENTE (Excel N6)
  descuento_proveedor: number;  // 0-100 (porcentaje) — descuento del PROVEEDOR a Dasic (Excel H6)
  entrega_min: number | null;
  entrega_max: number | null;
  entrega_unidad: EntregaUnidad;
  observaciones_linea: string;

  // Solo presente cuando la línea viene de una cotización cargada (modo edit).
  detalle_id?: number;
};

// Línea NO soportada en el editor SPA. Hasta 2026-05-23 incluía fantasmas
// y servicios; desde entonces fantasmas y servicios_catalogo entran al cart.
// Hoy es solo un fallback defensivo: detalles sin producto_id, sin servicio_id
// y sin descripcion_libre (raro, pero no rompe el guardado si aparece).
export type LineaNoSoportada = {
  detalle_id: number;
  descripcion: string;
  cantidad: number;
};

// Respuesta del GET /api/ventas/{id}/detalle-json (subset MVP).
// Shape REAL del backend (`app/routers/ventas.py:1354`).
// Wave C (2026-05-25): el backend ya expone `id` por detalle. El store ahora
// lo prefiere y solo cae al índice como fallback defensivo (ver hydrateFromOrden).
export type OrdenVentaDetail = {
  id: number;
  folio: string;
  estatus: string;
  cliente_id: number | null;
  contacto_id: number | null;
  moneda: string;
  // Modelo TC Excel V_03 (2026-05-23): tipo_cambio es el DOF. Los otros 2
  // pueden ser null en cotizaciones legacy creadas antes del modelo nuevo;
  // en ese caso el SPA los deriva de DOF±tolerancia_tc vía `resolveDirectionalTcs`.
  tipo_cambio: number | string;
  tc_mn_a_usd: number | string | null;
  tc_usd_a_mn: number | string | null;
  // Tolerancia simétrica del spread (0.1-1.0; default 1.0 para legacy).
  tolerancia_tc?: number | string | null;
  fecha_creacion: string | null;
  fecha_vencimiento: string | null;
  observaciones: string | null;
  terminos_condiciones: string | null;
  version: number;
  // Lifecycle (commits 410f805, 4bc3889): el backend los expone en
  // /detalle-json. El SPA puede mostrarlos como "última edición",
  // "enviada al cliente", "PDF desactualizado".
  enviada_at?: string | null;
  pdf_generado_at?: string | null;
  pdf_desactualizado?: boolean;
  actualizado_en?: string | null;
  // PDF unificado: el backend SÍ devuelve estos campos en /detalle-json
  // (ver app/routers/ventas.py:1439-1440).
  pdf_unificado?: 0 | 1 | null;
  concepto_unificado?: string | null;
  detalles: Array<{
    // PK del detalle. Backend lo provee desde 2026-05-25 (Wave C audit).
    // Antes el store sintetizaba por índice — ahora preferimos el real.
    id?: number;
    producto_id: number | null;
    servicio_id: number | null;
    sku_libre: string | null;
    descripcion_libre: string | null;
    moneda_origen_linea: string | null;
    costo_base_linea: number | string;
    cantidad: number;
    precio_unitario?: number | string;
    utilidad_aplicada: number | string;
    descuento_aplicado: number | string;
    descuento_proveedor?: number | string | null;
    subtotal?: number | string;
    tipo_linea: string;
    entrega_min: number | null;
    entrega_max: number | null;
    entrega_unidad: string | null;
    observaciones_linea: string | null;
    proveedor_sugerido_id?: number | null;
    fantasma_id?: number | null;
    // US-013/014: snapshot de marca + flag de visibilidad en PDF por línea.
    marca?: string | null;
    mostrar_marca?: boolean | null;
    clave_prod_serv?: string | null;
    clave_unidad_sat?: string | null;
    // Shape REAL del producto en /detalle-json: el backend ya colapsa
    // `sku` = sku_comercial || sku, y expone el interno como `sku_interno`.
    producto: {
      id: number;
      sku: string;
      sku_interno?: string | null;
      nombre: string;
      marca?: string | null;
      moneda_compra?: string | null;
      costo_compra: number | string;
      // Opcional por compatibilidad: una respuesta cacheada o un backend
      // anterior a agosto de 2026 no lo trae, y el store cae a 0 como antes.
      stock_actual?: number | null;
    } | null;
    servicio: {
      id?: number;
      codigo: string;
      nombre: string;
      moneda?: string | null;
      costo?: number | string | null;
      clave_prod_serv?: string | null;
      clave_unidad_sat?: string | null;
    } | null;
  }>;
};

// Payload para POST/PUT /api/ventas. Soporta líneas de catálogo, fantasmas y
// servicios_catalogo. Backend (`_resolve_tipo_linea` en ventas.py:48)
// distingue por la combinación de producto_id/servicio_id/tipo_linea/
// descripcion_libre.
export type DetalleOrdenCreate = {
  producto_id: number | null;
  servicio_id: number | null;
  cantidad: number;
  utilidad: number;
  descuento: number;
  descuento_proveedor: number;
  moneda_origen: Moneda;
  // Para catálogo: sku_libre y descripcion_libre solo si hay override.
  // Para fantasma: ambos son requeridos por el backend.
  // Para servicio_catalogo: opcional; backend usa el snapshot del Servicio.
  sku_libre: string | null;
  descripcion_libre: string | null;
  // Para catálogo: costo_unitario solo si override (vs catálogo).
  // Para fantasma: requerido y > 0.
  // Para servicio_catalogo: opcional; si null backend usa Servicio.costo.
  costo_unitario: number | null;
  tipo_linea: 'producto_catalogo' | 'producto_fantasma' | 'servicio_catalogo';
  proveedor_sugerido_id: number | null;
  entrega_min: number | null;
  entrega_max: number | null;
  entrega_unidad: EntregaUnidad;
  observaciones_linea: string | null;
  // US-008: marca + claves SAT + notas del fantasma (solo líneas ad-hoc).
  marca?: string | null;
  marca_id?: number | null;
  clave_prod_serv?: string | null;
  clave_unidad_sat?: string | null;
  observaciones?: string | null;
  // US-013/014: flag por línea para concatenar la marca en el PDF.
  mostrar_marca?: boolean;
};

export type OrdenVentaCreate = {
  cliente_id: number | null;
  contacto_id: number | null;
  moneda: Moneda;
  // Modelo TC Excel V_03: tipo_cambio = DOF, los otros 2 son los direccionales.
  // Si null, el backend los deriva con DOF±tolerancia_tc.
  tipo_cambio: number;
  tc_mn_a_usd: number | null;
  tc_usd_a_mn: number | null;
  // Tolerancia simétrica del spread DOF±X (0.1-1.0; default 1.0).
  tolerancia_tc: number;
  fecha_creacion: string | null;
  fecha_vencimiento: string | null;
  observaciones: string | null;
  terminos_condiciones: string | null;
  // PDF unificado (sub-proyecto D). Nombres match con `app/schemas/sales.py:102-103`:
  //   pdf_unificado: 0 = desglose por línea (default), 1 = concepto único
  //   concepto_unificado: texto del concepto cuando pdf_unificado=1, null en caso contrario
  // Nota interna: el store del SPA usa `pdf_concepto_enabled`/`pdf_concepto_unificado`
  // como interfaz interna; el mapeo a los nombres del backend ocurre en `buildSavePayload`.
  pdf_unificado: 0 | 1;
  concepto_unificado: string | null;
  detalles: DetalleOrdenCreate[];
};

// === Historial ===
//
// Shape ajustado al backend real (`app/routers/ventas.py:1188`):
// el endpoint devuelve un array plano (sin paginación servidor) y los campos
// `cliente` (string), `fecha`, no `cliente_id`/`cliente_nombre`/`fecha_creacion`.
// Las búsquedas y paginación se hacen en cliente.

// Estos valores coinciden con `EstatusOrden` en `app/models/enums.py` —
// el enum del backend es str-mixed y serializa en minúsculas.
export type EstatusOrden =
  | 'cotizacion'
  | 'pendiente'
  | 'pagada'
  | 'cancelada';

export type OrdenHistorial = {
  id: number;
  folio: string;
  estatus: EstatusOrden;
  cliente: string | null;
  total: number;
  moneda: Moneda;
  tipo_cambio: number;
  fecha: string;
  fecha_vencimiento: string | null;
  version: number;
  cotizacion_origen_id: number | null;
  edad_dias: number;
  dias_restantes: number | null;
  esta_vencida: boolean;
};

export type HistorialFiltros = {
  estatus?: EstatusOrden | '';
  desde?: string;        // YYYY-MM-DD
  hasta?: string;
  q?: string;            // folio o cliente
  page?: number;
  page_size?: number;
};

// === Sugerir OC ===
//
// Shape ajustado a `app/services/auto_oc_service.py::previsualizar_ocs`.

export type LineaSugeridaOC = {
  producto_id: number | null;
  sku: string | null;
  nombre: string;
  cantidad: number;
  costo_unitario: number;
  moneda: Moneda;
};

export type LineaSinProveedor = {
  producto_id: number | null;
  sku: string | null;
  nombre: string;
  faltante: number;
};

export type SugerenciaOCPorProveedor = {
  proveedor_id: number;
  proveedor_empresa: string | null;
  items: LineaSugeridaOC[];
  subtotal: number;
};

export type SugerirOCResponse = {
  por_proveedor: SugerenciaOCPorProveedor[];
  sin_proveedor: LineaSinProveedor[];
  total_proveedores: number;
};

export type GenerarOCResponse = {
  ocs: Array<{
    id: number;
    folio: string;
    proveedor_id: number;
    items: number;
    subtotal: number;
  }>;
};

// === Versiones / recotizar ===
//
// Shape ajustado a `app/routers/ventas.py:1070-1106`.

export type VersionOrden = {
  id: number;
  folio: string;
  version: number;
  estatus: EstatusOrden;
  total: number;
  moneda: Moneda;
  fecha: string;
};

export type ConvertirResponse = {
  mensaje: string;
  nuevo_folio: string;
};

// Recotizar devuelve el `OrdenVentaResponse` completo; aquí curamos sólo lo
// que necesita el flujo de UI.
export type RecotizarResponse = {
  id: number;
  folio: string;
  version: number;
};

// === Plantillas ===
//
// Shape REAL del backend (`app/routers/ventas.py:1855`):
//   GET → [{ id, nombre, descripcion, lineas, n_lineas, creado_en, es_global, es_propia }]
//   POST input → { nombre, descripcion?, lineas: [...] }
//   POST output → { id, nombre, n_lineas }
//
// El plan usaba `payload.cart` + `cantidad_lineas`; aquí adoptamos los nombres
// reales del backend para evitar transformaciones a media capa.

export type PlantillaLinea = {
  // nullable: aunque hoy el guardado filtra a solo-catálogo, una línea
  // fantasma/servicio legacy podría no traer producto_id. El loader lo omite.
  producto_id: number | null;
  qty: number;
  utilidad: number;
  descuento: number;
  entrega_min: number | null;
  entrega_max: number | null;
  entrega_unidad: 'dias' | 'semanas' | null;
  observaciones_linea: string;
};

export type Plantilla = {
  id: number;
  nombre: string;
  descripcion: string | null;
  lineas: PlantillaLinea[];
  n_lineas: number;
  creado_en: string | null;
  es_global: boolean;
  es_propia: boolean;
};

export type PlantillaCreate = {
  nombre: string;
  descripcion?: string;
  lineas: PlantillaLinea[];
};

export type PlantillaCreateResponse = {
  id: number;
  nombre: string;
  n_lineas: number;
};

// Contacto de la empresa (subset para el sub-selector del cotizador).
export type ContactoLite = {
  id: number;
  nombre: string;
  cargo: string | null;
  es_principal: boolean;
};
