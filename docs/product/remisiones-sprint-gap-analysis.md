# Remisiones — Gap analysis del spec Scrum vs implementación actual

> 2026-08-04. Insumo: spec de refinamiento (reunión Vania/Axel/Emmanuel) vs auditoría factual del módulo en `main`. Referencias archivo:línea verificadas.

## ⚠️ Hallazgo previo a todo

Existe un worktree `.worktrees/remisiones-v2` (rama `feat/remisiones-v2`) con una v2 **ya iniciada**: migraciones `20260803_01_remision_estados` y `20260803_03_remision_origen` y un `app/domains/remisiones/`. **Antes de planear el sprint hay que revisar esa rama** — parte del trabajo del spec puede estar avanzado ahí. Este análisis describe `main`.

## Resumen ejecutivo

El spec asume un módulo por construir; en `main` ya existe ~60% del alcance P0: remisiones manuales y desde orden, folio automático transaccional, edición de cantidades con tope, PDF + Word con precios opcionales, historial con filtros y recepción. **El valor real del sprint está en 4 huecos**: (1) contabilidad de entregas parciales (cotizada/entregada/pendiente — hoy se puede sobre-entregar repitiendo remisiones), (2) estados del documento (borrador/emitida/cancelada — hoy no existen), (3) remisión→cotización (no existe), (4) visibilidad de remisiones desde la cotización/seguimiento (no existe).

## Mapa historia por historia

| Historia | Estado en `main` | Evidencia / gap |
|---|---|---|
| US-REM-001 manual | ✅ **Hecha** (modo "libre" con cliente_id; líneas catálogo/servicio/fantasma; PDF; historial) | `schemas/remisiones.py:29-33`. Gap menor: no hay borrador persistente. |
| US-REM-002 folio | ✅ **Hecha** — formato real `R-YYMM####` (ej. `R-26080001`), advisory lock, reinicio mensual | `routers/remisiones.py:25-51`. El spec propone `R-26-08-0001`: solo difiere en guiones — **decidir con DASIC si se cambia** (hay folios vivos con el formato actual). |
| US-REM-003 unidades | 🟡 **Parcial** — usa **clave SAT** (catálogo de 2.4K, no administrable desde el form); líneas ad-hoc quedan sin unidad; el catálogo comercial administrable (`/catalogos/unidades`) NO se usa en remisiones | `models/remisiones.py:43`, `store.ts:132,155,175`. Gap: selector de unidad en el form + conectar catálogo comercial (las unidades del spec: pieza/metro/caja/kit/mes/servicio son comerciales, no SAT). |
| US-REM-004 desde cotización | 🟡 **Parcial** — existe desde **orden de venta** (cotización convertida); remisionar una cotización sin convertir está prohibido (400) | `routers/remisiones.py:62-63`. **Decisión de modelo**: el spec pide desde cotización; hoy el paso es convertir→remisionar. Opciones: (a) permitir desde estatus COTIZACION, (b) mantener el paso por orden y mejorar el atajo. La rama v2 (`remision_origen`) parece atacar esto. |
| US-REM-005 seleccionar partidas | 🟡 **Parcial** — el draft precarga todo; se excluye eliminando la línea o poniendo cantidad 0 (solo viajan cantidades >0); no hay checkboxes ni "seleccionar todas" | `store.ts:77-101`, `CrearRemisionPage.tsx:118,133`. El tipo `incluir` existe sin uso (`types.ts:74`). Gap de UX, no de modelo. |
| US-REM-006 cantidad entregada | 🔴 **El hueco crítico** — se valida contra la cantidad TOTAL de la orden, **sin restar entregas previas**: dos remisiones pueden entregar 2× lo cotizado (viola BR-05) | `routers/remisiones.py:210-211`. Requiere: cálculo de entregado acumulado por `detalle_orden_id` + validación server-side + mostrar cotizada/entregada/pendiente en el draft. |
| US-REM-007 avance de entrega | 🔴 **No existe** — la cotización/seguimiento no muestra remisiones asociadas (grep vacío en cotizador/seguimiento); el filtro backend `?orden_venta_id=` existe pero sin consumidor | `routers/remisiones.py:101`. Además bug real: las remisiones desde orden **no aparecen en la actividad del cliente** (filtra por `cliente_id`, que es NULL en modo orden — `clientes.py:528-536`). |
| US-REM-008 borrador editable | 🔴 **No existe** — el "borrador" es un GET en memoria; no hay estados ni edición post-creación ni cancelación | Sin columna de estatus; solo binario `recibido_at`. La rama v2 (`remision_estados`) parece atacar esto. |
| US-REM-009 remisión→cotización | 🔴 **No existe** (grep vacío) | Nuevo desarrollo; simétrico al deal→cotización recién construido (patrón reutilizable: navegar al cotizador con prefill + vínculo de vuelta). |
| US-REM-010 historial | ✅ **Hecha** con matices — filtros reales: búsqueda (folio/cliente), recibida/pendiente, paginación; **faltan**: rango de fechas, usuario creador | `routers/remisiones.py:89-158`, `RemisionesPage.tsx:298-357`. |
| US-COM-001 estados cotización (12) | 🟡 P2 — `EstatusOrden` actual es más corto; los estados de entrega (parcial/entregada) dependen de US-REM-006/007 | Refinar después. |
| US-OC-001 OC desde cotización | ✅ **Ya existe** (el spec no lo sabe): borrador de OC desde cotización, agrupación por proveedor, confirmación | `compras.py` + `auto_oc_service.py`. Solo refinar contra las reglas nuevas. |

## Reglas de negocio: cumplimiento actual

- BR-01 (remisión sin cotización) ✅ · BR-02 (una cotización origen) ✅ (FK única) · BR-03 (N remisiones por cotización) ✅ permitido · **BR-05 ❌ violada** (sin acumulado — el hueco crítico) · BR-06 🟡 (los precios son toggle `mostrar_precios`, default oculto; el spec dice "nunca" — **decidir**: el toggle ya existe y se usa) · BR-07 ✅ (trazabilidad por FK + folio inmutable) · BR-08 (conversión crea documento nuevo) — aplicable al construir US-REM-009 · BR-09 ✅ (advisory lock) · BR-10 🟡 (hoy todo es `allow_all_staff` plano; la matriz de permisos del spec §9 requiere diferenciar crear/emitir/cancelar/aprobar).

## Respuestas a las 15 preguntas abiertas (lo que el código ya decide)

1. **Folio**: hoy `R-YYMM####` sin guiones. Cambiarlo es trivial técnicamente; el costo es consistencia histórica. 2. **Reinicio**: mensual (implícito en el prefijo YYMM). 3. **¿Varias cotizaciones por remisión?**: hoy no (FK única) — mantener en v1 como dice BR-02. 4. **¿Entregar más de lo cotizado?**: hoy SÍ se puede por accidente (el bug); con el fix, proponer bloqueo + override con permiso de supervisor. 5. **¿Quién cancela?**: hoy nadie (no existe cancelar) — construir con rol admin/supervisora. 6. **¿Editar emitida?**: hoy no hay emisión formal; con estados, emitida = solo lectura + eventos de cambio. 7. **Firma**: hoy solo texto `recibido_por` + líneas de firma impresas. 8. **Evidencia foto**: no existe (fase posterior, requiere storage de archivos — no hay hoy). 9. **Unidades iniciales**: el catálogo comercial administrable ya existe; falta conectarlo. 10. **PDF**: ya imprime folio, fecha, cliente, tabla con unidad, observaciones, firmas, precios condicionales; falta `recibido_por` impreso y RFC en el PDF (el Word sí trae RFC). 11. **Estado cancelada**: no existe — incluir en el modelo de estados. 12. **Quién recibió**: sí se registra (`recibido_por`/`recibido_at`), no reversible, vía query string (mejorable a body). 13. **¿Decimales?**: **hoy NO** — `cantidad` es Integer (`models/remisiones.py:41`); si DASIC entrega metros/kg parciales hay que migrar a DECIMAL (⚠️ pregunta importante para Vania). 14. **Almacenes**: no existen (fuera de alcance, correcto). 15. **Referencia visible en conversión**: sí, diseñarla como el vínculo deal↔cotización ya construido.

## Conflictos spec ↔ realidad que requieren decisión del PO

1. **Origen de la remisión**: ¿desde cotización directa o mantener el paso por orden de venta? (afecta modelo y reportes de venta).
2. **Formato de folio**: conservar `R-YYMM####` vs cambiar a `R-YY-MM-####`.
3. **Precios**: ¿eliminar el toggle (nunca mostrar, BR-06) o conservarlo? Hoy DASIC lo tiene disponible.
4. **Cantidades decimales** (pregunta 13) — decisión de datos con migración.
5. **DoD del spec** exige multi-tenant y staging: el sistema es **mono-tenant por decisión** (documentado) y no hay staging — ajustar la DoD o crear entorno staging en Railway (factible, ~1h).

## Propuesta de sprint realista (mapeada al repo)

**Ya no consumen sprint** (existen): US-REM-001, 002, 010 base, US-OC-001 base.

**Sprint 01 propuesto** (en orden de dependencia):
1. **Estados de remisión** (borrador persistente/emitida/cancelada) + restricciones de edición — retomar `feat/remisiones-v2` si su avance sirve. [US-REM-008, BR-07]
2. **Contabilidad de entregas parciales**: entregado acumulado por partida server-side, validación BR-05, draft con cotizada/entregada/pendiente. [US-REM-006, el corazón]
3. **Selección de partidas con checkboxes** + "todas"/"limpiar" en el draft. [US-REM-005]
4. **Avance de entrega visible**: chip/summary en seguimiento + lista de remisiones asociadas en el detalle de la orden + fix del timeline de cliente. [US-REM-007]
5. **Selector de unidad comercial** conectado al catálogo administrable. [US-REM-003]
6. **Remisión→cotización** (patrón deal→cotización). [US-REM-009]
7. Filtros de fecha/creador en historial. [US-REM-010 cierre]

Estimación honesta: 1 y 2 son el 60% del esfuerzo (modelo + migración + backfill + validaciones); 3-7 son incrementos de ~½ día cada uno sobre esa base. El rango "1-2 semanas" del spec es alcanzable **si** las 5 decisiones del PO llegan al inicio.
