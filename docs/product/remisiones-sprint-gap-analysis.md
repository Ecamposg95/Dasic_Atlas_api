# Remisiones — Estado vs spec Scrum (versión post-integración)

> **v2 · 2026-08-04** — actualizado tras el merge de `feat/remisiones-v2` a `main` (`ad5b796`, **en producción**). Sustituye al análisis previo (que describía el estado anterior al merge). Insumo para la sesión de refinamiento con Vania (PO) y Axel (key user).

## Resumen para la reunión

**El Sprint Goal 01 del spec está sustancialmente entregado y en producción.** Las 8 historias recomendadas para el sprint están hechas o casi hechas; el sistema ya soporta el flujo completo: borrador → selección de partidas con pendientes → emisión con folio → recepción → cancelación con reversa, más la conversión remisión→cotización. Quedan 5 detalles de cierre (abajo) y 4 decisiones de producto que el equipo debe validar porque el código ya tomó postura.

## Mapa historia por historia (estado actual)

| Historia | Estado | Detalle |
|---|---|---|
| US-REM-001 remisión manual | ✅ | Modo libre con cliente; **borrador persistente** que no consume folio |
| US-REM-002 folio automático | ✅ | `R-YYMM####`, transaccional, reinicio mensual, **asignado al emitir** (los borradores imprimen "SIN FOLIO" con marca de agua BORRADOR) |
| US-REM-003 unidades | 🟡 casi | Catálogo comercial administrable (Pieza/Metro/Caja/Kit/Mes/Servicio…) sembrado y con selector en UI. **Detalle abierto:** en partidas provenientes de orden el selector no persiste (el backend conserva la unidad de la orden) — funciona en líneas ad-hoc |
| US-REM-004 desde cotización | 🟡 decisión | El flujo sigue siendo cotización → **convertir a venta** → remisionar (remisionar una cotización sin convertir da 400). Decidir con el PO si ese paso intermedio es aceptable (hoy da control) o se pide el atajo directo |
| US-REM-005 selección de partidas | ✅ | **Checkboxes reales** + "Seleccionar todas"/"Limpiar"; las partidas ya entregadas arrancan desmarcadas |
| US-REM-006 cantidades / BR-05 | ✅ | Contabilidad **cotizado/entregado/pendiente** por partida, validación transaccional con lock; sobre-entrega bloqueada salvo permiso (admin/gerencia) y **queda auditado quién autorizó**; el error muestra el desglose de excesos |
| US-REM-007 avance de entrega | 🟡 casi | Endpoint de avance + card en el detalle de la venta (por partida: NO_ENTREGADA/PARCIAL/ENTREGADA + lista de remisiones + botón "Nueva remisión", navegación bidireccional). **Faltan:** columna/chip en el listado de Seguimiento y el fix del timeline del cliente |
| US-REM-008 borrador/estados | ✅ | BORRADOR/EMITIDA/RECIBIDA/CANCELADA con ciclo completo; emitida no editable (409 y la UI no abre el editor); cancelar exige motivo y revierte stock si se descontó |
| US-REM-009 remisión→cotización | ✅ | Desde emitida/recibida; la cotización nace en borrador con **precios en 0** (fuerza re-precio, como pedía el spec) y guarda `remision_origen_id`; repetible a propósito. Pendiente menor: mostrar la referencia de origen en la UI de la cotización (pregunta 15) |
| US-REM-010 historial | 🟡 casi | Filtros de búsqueda, estado y **fechas** en UI; el backend también acepta creador pero falta el selector en pantalla |
| US-OC-001 | ✅ ya existía | OC desde cotización con agrupación por proveedor |
| BR-05 | ✅ | Cerrada (antes se podía sobre-entregar) |
| BR-06 precios | 🟡 decisión | Se conservó el **toggle** mostrar/ocultar (default oculto). El spec pedía "nunca" — validar con el PO |
| BR-09 folios | ✅ | Advisory lock, servicio centralizado |
| BR-10 permisos | ✅ | Matriz por rol: gerencia gestiona todo; ventas crea/emite/convierte **lo suyo** (no cancela ni sobre-entrega); operativo solo lee y registra recepción de emitidas |

## Preguntas abiertas del spec: ya decididas por el código

| # | Pregunta | Decisión vigente |
|---|---|---|
| 1-2 | Formato/reinicio de folio | `R-YYMM####`, reinicio mensual (NO se adoptó `R-YY-MM-####`) — **validar** |
| 4 | ¿Entregar más de lo cotizado? | Bloqueado; override con permiso y auditoría |
| 5 | ¿Quién cancela? | Admin y gerencia; motivo obligatorio; solo emitida/recibida |
| 6 | ¿Editar emitida? | No (borrador sí) |
| 11 | ¿Estado cancelada? | Sí, con motivo visible |
| 12 | ¿Quién recibió? | Sí (`recibido_por` + fecha) |
| 13 | ¿Decimales? | **Sí** — cantidades a 3 decimales (con guarda: el stock exige enteros y avisa en vez de truncar) |
| 15 | ¿Referencia visible al convertir? | Se guarda; falta mostrarla en UI |
| 7-8 | Firma / evidencia foto | Siguen sin existir (fase posterior; requiere almacenamiento de archivos) |
| 14 | Almacenes | Fuera de alcance (correcto) |

## Pendientes de cierre detectados en la verificación (mini-sprint de remate)

1. **Reporte "pendientes de remisionar" desactualizado por los estados**: cuenta cualquier remisión (incluso borradores o canceladas) como entrega — debe contar solo emitidas/recibidas. *(bug de datos en reporte)*
2. **Timeline/conteos del cliente ciegos a remisiones desde orden** (filtran por cliente directo, que es nulo en modo orden) — también afecta el unificador de empresas.
3. **Selector de unidad no-op en partidas de orden** (control visible sin efecto — confunde al usuario).
4. **Link roto en el listado**: la fila navega vía la ruta legacy y pierde el `?edit=` (el modal de detalle sí navega bien).
5. **La impresión de una CANCELADA no lleva sello/marca** (se imprime como documento normal).
6. Avance de entrega en el listado de **Seguimiento** + filtro por creador en historial (los "casi" de arriba).

## Decisiones que llevar a la sesión con DASIC

1. **Folio**: ¿se queda `R-26080001` o quieren `R-26-08-0001`? (cosmético; costo: consistencia histórica).
2. **Precios en remisión**: ¿mantener el toggle (flexibilidad) o forzar "nunca" (BR-06)?
3. **Origen**: ¿basta cotización→convertir→remisionar o necesitan remisionar la cotización sin convertirla?
4. **Firma/evidencia** (preguntas 7-8): ¿entra en el siguiente sprint? — implica infraestructura de archivos nueva.

## Nota de arquitectura

El módulo estrenó el patrón **dominio** (`app/domains/remisiones/`: router + service + repository + documentos con plantillas y autoescape) que el roadmap del repo pedía — es la referencia para futuras extracciones (ventas, compras). Trae suite pytest propia (≈50 tests del módulo, sobre SQLite con shims — la fidelidad de locks/migraciones de Postgres queda para un entorno CI con DB real).
