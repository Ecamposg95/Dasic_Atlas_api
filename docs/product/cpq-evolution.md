# Evolución del cotizador hacia CPQ industrial

> Task Pack 10 — documento de producto/arquitectura. **Solo diseño**: aquí no hay
> implementación, migraciones ni endpoints nuevos. Los contratos TypeScript de la
> sección 3 son la referencia para cuando se decida construir.

---

## 1. Estado actual del cotizador

El cotizador de Atlas es hoy un cotizador **transaccional por líneas** con modelo
de precio **costo + utilidad** (no lista de precios − descuento):

- **Precio por línea**: `precio = costo_convertido × (1 + utilidad%) × (1 − descuento_cliente%)`.
  El cálculo vive espejado en frontend (`web/src/features/cotizador/lib/calc.ts:84`,
  `lineImporte`) y backend (`_convert_cost_to_quote_currency`,
  `app/routers/ventas.py:229`). La utilidad se persiste por línea en
  `DetalleOrden.utilidad_aplicada` (`app/models/sales.py:114`) junto con
  `descuento_aplicado` (cliente) y `descuento_proveedor` (`app/models/sales.py:115-120`).
- **Multimoneda con TC del día**: cada línea guarda su moneda de origen y costo base
  (`moneda_origen_linea`, `costo_base_linea`, `app/models/sales.py:99-100`). La orden
  guarda el DOF (`tipo_cambio`), los TCs direccionales con spread (`tc_mn_a_usd`,
  `tc_usd_a_mn`) y la tolerancia (`app/models/sales.py:32-37`). El DOF se resuelve
  vía Banxico con cache diario (`app/services/fx_service.py`). El spread DOF±tolerancia
  es margen cambiario implícito, adicional a la utilidad por línea
  (`web/src/features/cotizador/lib/calc.ts:215`, `resolveDirectionalTcs`).
- **Cuatro tipos de línea**, resueltos por `_resolve_tipo_linea`
  (`app/routers/ventas.py:51`): `producto_catalogo`, `producto_fantasma` (ad-hoc con
  `sku_libre`/`descripcion_libre`, `app/models/sales.py:95-98`), `servicio_catalogo`
  (tabla `servicios`, `app/models/services.py:39`) y `servicio` ad-hoc legacy. El SPA
  soporta los tres primeros (`web/src/features/cotizador/types.ts:62`).
- **Folios y versionado en backend**: folio `C-YYMM###` / `V-YYMM###` con advisory
  lock (`_generar_folio`, `app/routers/ventas.py:120`); recotizar crea una hija
  `{folio_raiz}V{n}` vía `cotizacion_origen_id` + `version`
  (`app/routers/ventas.py:1152`, `app/models/sales.py:55-56`).
- **Plantillas/kits**: combinaciones de líneas reutilizables por usuario, JSON en
  `plantillas_cotizacion` (`app/models/plantillas.py:10`; endpoints en
  `app/routers/ventas.py:2181-2255`).
- **Salidas**: PDF (`app/routers/ventas.py:1633`) y Word (`app/routers/ventas.py:1742`),
  con modo "concepto unificado" (`pdf_unificado`/`concepto_unificado`,
  `app/models/sales.py:49-52`) y términos comerciales editables.
- **OC automática agrupada por proveedor**: `app/services/auto_oc_service.py:27`
  (`previsualizar_ocs`) calcula faltantes contra stock disponible, agrupa 1 OC
  borrador por proveedor y las vincula con `cotizacion_id`
  (`generar_ocs`, `app/services/auto_oc_service.py:98`). La OC usa DOF puro, sin spread.
- **Margen visible**: `computeCostos` (`web/src/features/cotizador/lib/calc.ts:163`)
  muestra costo total (DOF, con descuento de proveedor) y margen real de la
  cotización — ya existe la noción de "ganancia real" aunque solo como indicador.

**Lo que el cotizador NO es hoy**: no hay concepto de "solución" o "proyecto" que
agrupe líneas; la cotización es una lista plana. No hay tipos de costo más allá de
producto/servicio (mano de obra, ingeniería y viáticos se capturan como servicios o
fantasmas genéricos). No hay reglas de margen por tipo, ni contingencia, ni flujo de
aprobación (cualquier staff puede emitir con cualquier margen —
`allow_all_staff` en todos los endpoints de `ventas.py`).

---

## 2. Modelo objetivo: CPQ industrial por componentes

El objetivo (Prompt Maestro Atlas Industrial Services) es cotizar **soluciones**:
un paquete con nombre e importe propio, compuesto por bloques de costo heterogéneos.
Una cotización podrá contener una o varias soluciones, además de líneas sueltas
tradicionales.

Bloques del modelo objetivo y su mapeo al modelo actual:

| Bloque CPQ | Qué es | Mapeo actual (`DetalleOrden.tipo_linea`, `app/models/sales.py:123`) | Qué falta |
|---|---|---|---|
| **Equipos** | Bienes de capital / unidades principales | `producto_catalogo` o `producto_fantasma` | Nada estructural; falta poder marcarlos como "equipo" dentro de una solución |
| **Materiales** | Consumibles, tornillería, cable, tubería | `producto_catalogo` / `producto_fantasma` | Igual que equipos; hoy indistinguibles de un equipo |
| **Mano de obra** | Horas/días de técnicos propios | `servicio_catalogo` (categoría `mantto`/`otro`, `app/models/services.py:23`) | Costo por hora/rol y cantidad en horas como unidad de primera clase (hoy `tiempo_estimado` es informativo) |
| **Ingeniería** | Diseño, planos, memoria de cálculo | `servicio_catalogo` (`asesoria`) o fantasma | Tipo propio con margen distinto al de materiales |
| **Programación** | PLC/HMI/SCADA, configuración | Sin representación específica — cae en servicio genérico | Tipo propio; suele cotizarse por hora con tarifa distinta a mano de obra mecánica |
| **Instalación** | Montaje en sitio | `servicio_catalogo` (`instalacion`) | Vincular a duración/cuadrilla; hoy es un renglón de monto fijo |
| **Viáticos** | Traslado, hospedaje, alimentación | Sin representación — se cuela como fantasma o se omite | Tipo propio, típicamente **sin margen o margen reducido** (hoy heredaría la utilidad general) |
| **Servicios externos** | Subcontratos, laboratorio, grúas, terceros | `producto_fantasma` con `proveedor_sugerido_id` (`app/models/sales.py:124`) | Distinguir subcontrato de compra de material — la OC automática ya sabe agrupar por proveedor (`app/services/auto_oc_service.py:83`), le falta el concepto "servicio externo" |
| **Margen** | Utilidad por bloque | `utilidad_aplicada` por línea (`app/models/sales.py:114`) + spread de TC | Margen **por tipo de componente** con defaults y pisos, no un % manual por renglón |
| **Contingencia** | Colchón de riesgo del proyecto (%) | No existe | % sobre el costo de la solución, visible internamente, no desglosado al cliente |

Lectura clave: **el 70% del modelo objetivo ya tiene dónde vivir**. La brecha no es
de cálculo (costo+utilidad+TC ya funciona) sino de **estructura** (agrupar líneas en
soluciones), **taxonomía** (tipo de componente con semántica de negocio) y
**gobierno** (reglas de margen/contingencia/aprobación).

---

## 3. Contratos TypeScript propuestos

Solo contratos — sin implementación. Vivirían en
`web/src/features/cotizador/types.ts` (o `features/cpq/types.ts`) cuando se construya.

```typescript
/** Taxonomía de componentes del CPQ industrial (Prompt Maestro). */
export type TipoComponenteCPQ =
  | 'equipo'
  | 'material'
  | 'mano_obra'
  | 'ingenieria'
  | 'programacion'
  | 'instalacion'
  | 'viaticos'
  | 'servicio_externo';

/** Unidades de cotización por componente. */
export type UnidadCPQ = 'pieza' | 'lote' | 'hora' | 'dia' | 'jornada' | 'viaje' | 'servicio';

/**
 * Un componente dentro de una solución. Generaliza el CartItem actual
 * (web/src/features/cotizador/types.ts:64): conserva costo+moneda origen
 * y agrega tipo/unidad/margen con semántica de negocio.
 */
export interface ComponenteCPQ {
  id?: number;                       // null hasta persistir
  tipo: TipoComponenteCPQ;
  descripcion: string;

  // Origen opcional — reusa el modelo de 4 tipos de línea actual:
  producto_id?: number | null;       // equipos/materiales de catálogo
  servicio_id?: number | null;       // mano de obra / instalación de catálogo
  proveedor_id?: number | null;      // servicio_externo / material fantasma

  cantidad: number;
  unidad: UnidadCPQ;
  costo_unitario: number;            // en moneda_origen (= costo_base_linea hoy)
  moneda_origen: 'MXN' | 'USD';
  descuento_proveedor_pct: number;   // reduce costo, igual que hoy (Excel H6)

  margen_pct: number;                // default por tipo desde ReglasCPQ; editable
  margen_bloqueado: boolean;         // true si la regla prohíbe bajarlo sin aprobación

  notas?: string | null;
}

/**
 * Solución: paquete con nombre que agrupa componentes y se presenta al
 * cliente como un importe (desglosado o unificado — extiende el patrón
 * pdf_unificado actual, app/models/sales.py:49).
 */
export interface SolucionCPQ {
  id?: number;
  cotizacion_id?: number;            // FK a ordenes_venta al persistir
  nombre: string;                    // "Automatización línea 3", "Kit arranque bomba"
  descripcion?: string | null;
  orden: number;                     // posición dentro de la cotización

  componentes: ComponenteCPQ[];

  contingencia_pct: number;          // % sobre costo total de la solución
  presentacion: 'desglosada' | 'unificada';   // qué ve el cliente en el PDF

  // Derivados (calculados server-side, nunca confiados del cliente —
  // misma regla que folios/totales hoy):
  costo_total?: number;              // Σ costo componentes + contingencia
  precio_venta?: number;             // Σ componentes con margen
  margen_pct_efectivo?: number;
}

/** Regla de margen/gobierno por tipo de componente. */
export interface ReglaMargenCPQ {
  tipo: TipoComponenteCPQ;
  margen_default_pct: number;        // se precarga al agregar componente
  margen_minimo_pct: number;         // debajo de esto → requiere aprobación
  permite_descuento_cliente: boolean;
}

/** Configuración de reglas del tenant (persistible tipo platform_config). */
export interface ReglasCPQ {
  margenes: ReglaMargenCPQ[];
  contingencia_default_pct: number;  // ej. 5
  contingencia_max_pct: number;      // ej. 15

  // Aprobaciones por umbral — roles reales de RolUsuario
  // (app/models/enums.py:82): ADMINISTRADOR, GERENTE_COMERCIAL, VENTAS.
  umbral_aprobacion: {
    margen_solucion_pct_min: number;      // margen efectivo < X% → aprobar
    descuento_cliente_pct_max: number;    // descuento > Y% → aprobar
    rol_aprobador: 'ADMINISTRADOR' | 'GERENTE_COMERCIAL';
  };
}
```

---

## 4. Esquema conceptual de datos (sin DDL)

Tres tablas nuevas; `ordenes_venta` y `detalles_orden` no se tocan en la primera
fase (una solución referencia la cotización, no la reemplaza).

**`soluciones`** — cabecera del paquete dentro de una cotización.

| Columna | Nota |
|---|---|
| `id` | PK |
| `cotizacion_id` | FK → `ordenes_venta.id`, indexada |
| `nombre`, `descripcion` | texto |
| `orden` | posición en la cotización |
| `contingencia_pct` | DECIMAL(5,2), default de `reglas_margen` |
| `presentacion` | `'desglosada' \| 'unificada'` (generaliza `pdf_unificado`) |
| `costo_total`, `precio_venta` | snapshots calculados server-side al guardar |
| `creado_en`, `actualizado_en` | timestamps |

**`componentes_solucion`** — línea de costo dentro de una solución. Deliberadamente
paralela a `detalles_orden` (`app/models/sales.py:83`) para poder converger después.

| Columna | Nota |
|---|---|
| `id` | PK |
| `solucion_id` | FK → `soluciones.id`, indexada |
| `tipo` | VARCHAR(20): `equipo`/`material`/`mano_obra`/`ingenieria`/`programacion`/`instalacion`/`viaticos`/`servicio_externo` |
| `producto_id`, `servicio_id`, `proveedor_id` | FKs opcionales — mismo patrón de origen triple que `detalles_orden` |
| `descripcion` | TEXT (mismo criterio que `descripcion_libre`, sin cap) |
| `cantidad`, `unidad` | DECIMAL + VARCHAR(10) (`hora`, `dia`, `pieza`, `viaje`, …) |
| `costo_unitario`, `moneda_origen` | mismo par que `costo_base_linea`/`moneda_origen_linea` |
| `descuento_proveedor_pct` | igual que `descuento_proveedor` actual |
| `margen_pct` | margen aplicado (precargado por regla) |
| `subtotal_costo`, `subtotal_venta` | snapshots server-side |
| `notas` | TEXT |

**`reglas_margen`** — configuración de gobierno (una fila por tipo, más filas de
umbral global; alternativa: JSON en `platform_config`, que ya existe para IVA/vigencia).

| Columna | Nota |
|---|---|
| `id` | PK |
| `tipo_componente` | VARCHAR(20), único |
| `margen_default_pct`, `margen_minimo_pct` | DECIMAL(5,2) |
| `permite_descuento_cliente` | BOOLEAN |
| `activo` | BOOLEAN |
| `actualizado_por_id`, `actualizado_en` | auditoría |

Umbrales globales (`contingencia_default_pct`, `margen_solucion_pct_min`,
`descuento_cliente_pct_max`, `rol_aprobador`) pueden vivir en `platform_config`
para no crear una cuarta tabla.

Nota de compatibilidad: los totales de la cotización siguen siendo la suma de
`detalles_orden` + `soluciones`; folios, IVA y recotizado no cambian. Una solución
recotizada se copia igual que hoy se copian los detalles (`app/routers/ventas.py:1238`).

---

## 5. Reglas iniciales de negocio (propuesta v1)

Valores de arranque — editables por ADMINISTRADOR desde configuración; son el
seed de `reglas_margen`, no constantes en código:

| Tipo de componente | Margen default | Margen mínimo | Descuento cliente |
|---|---|---|---|
| Equipo | 25% | 15% | Sí |
| Material | 30% | 20% | Sí |
| Mano de obra | 40% | 30% | Sí |
| Ingeniería | 50% | 35% | Sí |
| Programación | 50% | 35% | Sí |
| Instalación | 35% | 25% | Sí |
| Viáticos | 10% | 0% | No (pass-through) |
| Servicio externo | 15% | 10% | No |

**Contingencia**: default 5% sobre el costo total de la solución; máximo 15%.
Se muestra en la vista interna (junto al margen real que hoy calcula
`computeCostos`, `web/src/features/cotizador/lib/calc.ts:163`) y **no** se
desglosa como renglón en el PDF del cliente — se distribuye en el precio.

**Aprobaciones por umbral** (con los roles existentes de `RolUsuario`,
`app/models/enums.py:82`):

- **VENTAS**: cotiza libremente dentro de los márgenes default. Si el margen
  efectivo de una solución cae por debajo del mínimo de cualquier tipo, o el
  descuento al cliente supera 10%, la cotización queda en estado
  "pendiente de aprobación" (no puede marcar `enviada_at` ni generar PDF cliente).
- **GERENTE_COMERCIAL**: aprueba desviaciones hasta margen efectivo ≥ 10% de la
  solución y descuentos hasta 20%.
- **ADMINISTRADOR**: sin límite; puede aprobar margen negativo (casos
  estratégicos), con evento de auditoría.

La auditoría de aprobaciones reutiliza el patrón `QuoteEvent`
(`app/models/quote_events.py`) — un tipo de evento nuevo, no una tabla nueva.

**Interacción con el TC**: el spread DOF±tolerancia sigue siendo margen cambiario
implícito y **no cuenta** para el umbral de margen mínimo (el umbral se evalúa
sobre margen explícito con DOF puro, igual que `computeCostos` hoy).

---

## 6. Backlog incremental (de más barato a más caro)

Cada paso es entregable y útil por sí solo; ninguno depende del siguiente.

1. **Secciones/agrupadores de líneas en la cotización actual.** Un campo
   `seccion` (texto + orden) en `detalles_orden` y subtotales por sección en el
   cart y el PDF. Cero tablas nuevas; da el 50% del valor percibido ("solución"
   como título visual). Extiende `Cart.tsx` y el render PDF existente.
2. **Tipo de componente como etiqueta.** Campo `tipo_componente` opcional en
   `detalles_orden` con la taxonomía de la sección 3, seleccionable en
   `EditLineModal`. Solo clasificación — sin reglas todavía. Habilita reportes
   de mezcla de venta (equipos vs servicio) desde el día uno.
3. **Márgenes default por tipo.** Tabla `reglas_margen` (o JSON en
   `platform_config`) + precarga de `utilidad` al agregar línea según su tipo.
   Reusa el flujo de `useAutoUtilidad` (hoy sugiere por historial,
   `app/routers/ventas.py:2128`).
4. **Contingencia por sección.** % por sección, calculado server-side, visible
   en la vista interna junto al margen de `computeCostos`; distribuido en precio
   para el PDF cliente.
5. **Umbral de aprobación.** Estado "pendiente de aprobación" cuando margen o
   descuento violan la regla; botón aprobar para GERENTE_COMERCIAL/ADMINISTRADOR;
   evento en `quote_events`. Primer punto que toca RBAC real.
6. **Tablas `soluciones` + `componentes_solucion`.** Persistir la solución como
   entidad (migración Alembic), manteniendo `detalles_orden` para líneas sueltas.
   El PDF unificado por solución generaliza `pdf_unificado`.
7. **Plantillas de solución.** Evolución de `plantillas_cotizacion`
   (`app/models/plantillas.py:10`) para guardar/recargar soluciones completas con
   componentes tipados — el embrión del catálogo de soluciones.
8. **OC automática consciente de componentes.** Extender
   `auto_oc_service` para que `servicio_externo` genere OC de subcontrato al
   `proveedor_id` del componente (hoy los servicios se ignoran,
   `app/services/auto_oc_service.py:35`).

---

## 7. Qué NO hacer ahora (y por qué)

- **Motor de configuración completo (reglas de compatibilidad, wizard
  "configure-to-order").** Requiere un catálogo con atributos técnicos ricos y
  reglas mantenidas; el catálogo actual (`Producto`) no los tiene y el equipo de
  ventas es chico — el costo de mantener reglas superaría el ahorro. Las
  plantillas (paso 7) cubren el 80% del caso real: "arma lo mismo que la vez pasada".
- **Pricing engine (listas de precio por cliente/volumen, escalas, price
  waterfalls).** El modelo de negocio es costo+utilidad con TC del día; no hay
  listas de precio que administrar. Introducirlo ahora invertiría el modelo que
  el cliente pidió explícitamente (match al Excel V_03). Las reglas de margen de
  la sección 5 son el sustituto proporcional.
- **Catálogo de soluciones estandarizado (productos "solución" vendibles
  per se).** Antes de estandarizar hay que acumular datos: qué soluciones se
  repiten, con qué mezcla de componentes y qué margen real cierran. Los pasos 1-2
  generan exactamente esos datos; estandarizar antes es adivinar.
- **Rediseñar `detalles_orden` / migrar cotizaciones históricas al modelo
  CPQ.** El versionado, los PDFs y la OC automática dependen del shape actual;
  una migración big-bang arriesga el flujo que sí factura hoy. Por eso el esquema
  de la sección 4 es aditivo y los pasos 1-5 solo agregan columnas opcionales.
- **Aprobaciones multi-nivel / workflow engine.** RBAC tenant-aware sigue
  pendiente (checks por rol-string, ver `CLAUDE.md` y `app/security/jwt.py`);
  construir workflow encima de una base transicional es deuda asegurada. Un solo
  umbral con un solo aprobador (paso 5) resuelve el problema real.

---

*Documento generado como Task Pack 10 (plan Atlas Industrial Services). Fuentes:
`app/routers/ventas.py`, `app/models/sales.py`, `app/models/services.py`,
`app/models/plantillas.py`, `app/services/auto_oc_service.py`,
`web/src/features/cotizador/` (estado real al 2026-08-03, rama `main`).*
