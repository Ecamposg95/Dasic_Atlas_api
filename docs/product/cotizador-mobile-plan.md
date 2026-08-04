# Plan de usabilidad móvil del cotizador

**Fecha:** 2026-08-04 · **Origen:** pendiente de `docs/current-state/ux-audit-v2.md` (línea 19: "cotizador no usable en móvil — header con 6+ acciones, pickers `min-w-[260px]+`").
**Alcance:** solo layout/UX del cotizador SPA (`web/src/features/cotizador/` + `web/src/components/document/`). Sin cambios de backend, store ni modelo de datos.

---

## 1. Diagnóstico actual

### 1.1 Lo que YA funciona en móvil (y la auditoría no detectó)

La auditoría v2 reportó "cero fallbacks móviles tipo card en tablas". Eso es cierto para `features/`, pero el carrito del cotizador se apoya en componentes compartidos de `web/src/components/document/` que **sí tienen fallback móvil**:

- **`DocumentCartTable.tsx:71`** — la tabla desktop está en `hidden md:block` (con `min-w-[680px]` + `overflow-x-auto`, patrón aceptable), y **`:146-150`** renderiza en `md:hidden` una lista de `DocumentRowCard` apiladas.
- **`DocumentRow.tsx:349-529` (`DocumentRowCard`)** — card móvil ya funcional que cubre: badges Fantasma/Servicio y conversión de moneda (`:367-378`), cantidad editable con tope de stock (`:388-403`), precio unitario editable o importe (`:404-422`), PU/costo origen (`:424-434`), utilidad (`:436-448`), descuento (`:450-463`), entrega min–max–unidad (`:465-501`), botones Editar línea / Eliminar (`:382`, `:503-509`) y detalle expandido vía `expandedRenderer(uid, 'card')` (`:511-526`) — que `Cart.tsx:125-128` conecta a `RowExpanded` con `variant`.
- **`DocumentTotalsBar.tsx:23-48`** — barra `sticky bottom-0`, stats con `overflow-x-auto` horizontal en móvil y layout `flex-col md:flex-row`. El `TotalsBar.tsx:243-251` del cotizador ya arranca en modo compacto (solo Total + Margen).
- **Modales base razonables:** `EditLineModal.tsx:162` y `PlantillasModal.tsx:143` usan `max-w-lg/xl w-full max-h-[90vh] overflow-y-auto` — no rompen viewport.

**Conclusión del diagnóstico:** el carrito (la parte más difícil) ya es usable en móvil. Lo roto es lo que lo rodea: header de página, pickers de cabecera y densidad de acciones.

### 1.2 Lo que NO funciona en móvil

| Problema | Referencia | Detalle |
|---|---|---|
| Header de página con 5-6 acciones inline | `pages/CotizadorPage.tsx:257-342` | Badge "Editando", Borradores, Preview OC, Export JSON, Import JSON, Ver PDF — botones `text-[11px] px-2 py-1` (targets < 30px, por debajo de los ~44px táctiles) que envuelven en varias filas en 390px. |
| Pickers de cabecera con anchos fijos | `components/HeaderCotizacion.tsx:84` (`min-w-[260px]` Cliente), `:94` (`w-[110px]` Moneda), `:123` (`w-[120px]` TC), `:133,146` (`w-[150px]` fechas), `:181` (`min-w-[280px]` TCMiniTable) | En `flex-wrap` producen envolturas impredecibles: Cliente ocupa una fila, Moneda+TC otra, fechas parten en dos. No hay orden vertical intencional en < 640px. |
| Fila de gaps en la card móvil | `DocumentRow.tsx:349-529` | La card NO muestra: `StockBadge`, `MargenChip`, `EntregaChip`, badge "Editado", ni el botón de nota de línea (todos presentes en la fila desktop `:103-129`). Tampoco hay reordenamiento (sortable es solo desktop, `:316-318`). Inputs `h-7` (~28px) por debajo del mínimo táctil. |
| TotalsBar con 3 acciones anchas | `components/TotalsBar.tsx:332-341` | "Cancelar" + "Guardar cotización" + "Guardar e ir a Seguimiento" en una fila `justify-end`; en 390px el tercero envuelve o comprime. Warnings apilados arriba empujan el contenido. |
| Observaciones/Términos/PDF unificado en grid | `pages/CotizadorPage.tsx:373` | `grid-cols-1 md:grid-cols-2` — esto sí está bien; se lista para constar que no requiere cambio. |
| Atajos de teclado inútiles en móvil | `pages/CotizadorPage.tsx:160-190` | `/`, `ctrl+s`, `p` no aplican en touch; el popover de atajos ocupa espacio conceptual sin valor móvil. Menor. |

---

## 2. Casos de uso móviles reales (vendedor DASIC en campo)

**Sí son caso móvil:**

1. **Consultar y enviar una cotización existente** — abrir desde Seguimiento/Historial, revisar líneas y total, abrir el PDF y compartirlo (WhatsApp/correo). Es lectura + un botón; hoy ya casi funciona gracias a la card móvil.
2. **Ajustar una cotización en frente del cliente** — cambiar cantidad, utilidad o descuento de 1-2 líneas y re-guardar. La card móvil ya lo soporta; falla el entorno (header, guardar accesible).
3. **Cotización rápida simple** — cliente conocido + 1-3 productos de catálogo en MXN, sin tocar TC ni términos, para mandar un precio en minutos.

**NO son caso móvil (escritorio):** armado complejo multimoneda con TC/tolerancia, reordenamiento de líneas, edición de términos/concepto PDF, import/export de borradores JSON, preview de OCs. No se optimizan para touch; basta con que no rompan el layout.

---

## 3. Propuesta incremental en 3 fases

### Fase 1 — Arreglos de layout baratos (CSS/estructura, sin lógica nueva)

- **Header de página:** en `< md`, colapsar Borradores / Preview OC / Export / Import a un menú overflow ("⋯") y dejar visibles solo el badge "Editando" y "Ver PDF". En `md+` queda como está. Reusar el patrón de menú de `DocumentRow.tsx:281-309`.
- **Pickers de cabecera:** en `< sm`, apilar a ancho completo con orden fijo: Cliente → (Moneda | TC) en dos columnas → (F. creación | F. vencimiento) en dos columnas. Sustituir `min-w-[260px]`/anchos fijos por `basis-full sm:basis-auto sm:min-w-[260px]` o un `grid grid-cols-2 sm:flex`.
- **TotalsBar:** en `< md`, botones a `w-full` apilados (primario arriba) o degradar "Guardar e ir a Seguimiento" al overflow; subir a `h-9+` los targets.
- **Targets táctiles:** subir botones del header a `min-h-[40px]` en móvil.

**Archivos:** `web/src/features/cotizador/pages/CotizadorPage.tsx`, `web/src/features/cotizador/components/HeaderCotizacion.tsx`, `web/src/features/cotizador/components/TotalsBar.tsx`, `web/src/components/document/DocumentTotalsBar.tsx`.
**Riesgo: bajo.** Solo clases Tailwind y un menú; no toca store ni cálculo. Cuidado único: `DocumentTotalsBar` lo comparte remisiones (`features/remisiones/pages/CrearRemisionPage.tsx`) — verificar ambos consumidores.

### Fase 2 — Cerrar los gaps de la card móvil existente

Aprovechar que `DocumentRowCard` ya existe; no crear una card nueva.

- Añadir a la card: `StockBadge`, `MargenChip`, `EntregaChip`, badge "Editado" y acceso a nota de línea (misma info que la fila desktop `DocumentRow.tsx:103-129`).
- Subir inputs de `h-7` a `h-9`/`h-10` y `inputmode="decimal"`/`"numeric"` para teclado numérico.
- Consolidar acciones de la card (Eliminar / Editar línea) en un footer consistente o menú, en lugar de links sueltos arriba y abajo.
- Verificar `RowExpanded` en `variant='card'` (proveedor sugerido, costo OC) en 390px.

**Archivos:** `web/src/components/document/DocumentRow.tsx` (solo `DocumentRowCard`), `web/src/features/cotizador/components/RowExpanded.tsx`, posiblemente `web/src/components/document/types.ts` si la VM necesita exponer algo (hoy `tieneNota` ya está en la VM, `Cart.tsx:59`).
**Riesgo: medio-bajo.** Componente compartido con remisiones — los `caps` (`DocRowCaps`) ya condicionan qué se muestra, así que los añadidos deben respetar ese gating. Probar cotizador y remisiones.

### Fase 3 — Flujo "cotización rápida" móvil (solo si F1+F2 no bastan)

Modo simplificado sobre el mismo editor y el mismo store (no una página paralela): cliente + búsqueda de producto + cantidad + guardar/PDF, con Moneda fija MXN, fechas por default y todo lo demás (TC, términos, concepto PDF, fantasma) fuera de vista. Podría ser un query param (`?modo=rapido`) o detección de viewport que oculte secciones — decisión de diseño a validar **con uso real tras F1/F2**. Requiere que `TotalsBar`/`useGuardarCotizacion` sigan siendo la única vía de guardado.

**Archivos:** `CotizadorPage.tsx` (render condicional), posiblemente un `components/ModoRapido.tsx`; cero backend.
**Riesgo: medio.** El peligro real es la deriva hacia un segundo cotizador — mitigado si es estrictamente un filtro de vista sobre el mismo store/flujo de guardado. No arrancar esta fase sin evidencia de que los vendedores intentan crear cotizaciones en móvil y fallan.

---

## 4. Qué NO hacer

- **No apps nativas ni PWA offline.** El cotizador depende de catálogo, stock, TC y folios server-side; offline implicaría replicar reglas de negocio en cliente, contra la regla "folios/totales/stock son del backend".
- **No duplicar el cotizador** (ruta `/cotizador-movil` con store propio). Ya se pagó una vez la deuda del "cotizador clásico" legacy (`Cart.tsx:96-102`); un fork móvil divergiría igual.
- **No optimizar para móvil los flujos de escritorio** (multimoneda, reorder, import/export, términos). Basta con que no rompan el viewport.
- **No rediseñar la tabla desktop.** `min-w-[680px]` + `overflow-x-auto` ya fue re-evaluado como patrón aceptable en la auditoría v2.

## 5. Verificación sugerida

Sin suite de tests: validar manualmente en viewport 390×844 (dev tools) los tres casos de uso de §2, en cotizador **y** en crear remisión (componentes compartidos), antes de `cd web && npm run build`.
