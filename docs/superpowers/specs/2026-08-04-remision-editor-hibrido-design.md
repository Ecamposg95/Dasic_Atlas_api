# Editor de remisiones híbrido (interfaz idéntica al cotizador)

> Aprobado 2026-08-04. Decisiones del usuario: entrada directa al editor · partidas de orden directo al carrito con pendientes+checkbox · buscador de catálogo completo · historial por botón (sin entrada de menú propia).

## Objetivo

Al entrar a `/spa/remisiones` se ve la MISMA interfaz que el cotizador, con las capacidades propias de remisiones integradas (híbrido). Cero duplicación: composición con piezas compartidas.

## Rutas y navegación

- `/spa/remisiones` → **RemisionEditorPage** (nuevo editor; reemplaza a CrearRemisionPage como entrada).
- `/spa/remisiones/historial` → RemisionesPage actual (listado+filtros+modal detalle). Botón "Historial" en el editor; "Nueva remisión" de vuelta.
- `/spa/remisiones/:id/editar` → mismo editor cargando el borrador.
- Redirects: `/spa/remisiones-nueva` → `/spa/remisiones`. Deep-links `?orden_venta_id=`/`?ver=` (Seguimiento, AvanceEntregaCard, chip) → apuntan a `/spa/remisiones/historial`. `?orden={id}` en el editor = precarga esa orden.
- nav-config: EXTRA_ROUTES para `/spa/remisiones/historial` (Operación/Remisiones).

## Layout del editor (espejo del cotizador)

1. **PageHeader**: título "Nueva remisión" | "Editar remisión" + Badge estado; actions: Historial (icono History), Borradores (drawer), overflow ⋯ móvil.
2. **HeaderRemision** (equivalente a HeaderCotizacion): toggle **Desde orden ⇄ Libre**; en modo orden un **OrdenPicker** (búsqueda de órdenes remisionables por folio/cliente, usa `useOrdenesRemisionables`); en modo libre el `RemisionClientPicker` existente. "Avanzadas": fecha, transportista, observaciones. Toggle precios visibles.
3. **Panel de catálogo compartido** (`ProductSearchPanel`, extraído del cotizador): agregar productos/servicios/fantasmas como líneas ad-hoc.
4. **Carrito compartido** (`DocumentCartTable`/`DocumentRow`) con caps de remisión: `seleccionable` (checkbox incluir + Seleccionar todas/Limpiar) y `entregas` (columnas Cotizado/Entregado/Pendiente en líneas de orden), unidad editable, sin utilidad/descuento/importes salvo toggle.
5. **TotalsBar remisión** (existente) sticky: conteo/subtotal + **Guardar borrador / Emitir** (+ Cancelar edición en borrador existente).

## Contratos técnicos

- **`components/document/ProductSearchPanel`**: extracción del buscador del cotizador a componente prop-based (callbacks `onAddProducto/onAddServicio/onAddFantasma` + props de contexto mínimos que hoy toma del store). El cotizador lo consume vía wrapper delgado que conecta su store — comportamiento actual intacto.
- **`DocRowCaps` extendido**: `{ seleccionable?: boolean; entregas?: { cotizado, entregado, pendiente } }` → DocumentRow pinta checkbox y columnas SOLO si vienen; cotizador no las pasa → render idéntico al actual.
- **Store de remisiones**: se conserva y extiende (ya tiene incluir/pendientes/hydrate); se agrega selección de orden dentro del editor (sin pantalla previa) y carga vía `useBorradorRemision` existente.
- Backend intacto (borrador/emitir/excesos/estados ya cubren todo).

## Fuera de alcance (v1)

Atajos de teclado del cotizador; plantillas de remisión; multi-orden por remisión.

## Riesgos y mitigación

- Extracción del buscador toca cotizador → wrapper + typecheck + build + smoke del cotizador (crear cotización de prueba visual).
- DocumentRow compartido con 3 consumidores → caps opt-in, default = comportamiento actual byte-idéntico.

## Validación

`typecheck` + `build` + vitest existentes + smoke guiado (cotizador sin cambios visibles; editor: orden→checkbox→emitir; libre→catálogo→emitir; borrador→reabrir).

## Plan de ejecución (olas)

**Ola 1 (paralela, disjunta):**
- A: extraer ProductSearchPanel a components/document (prop-based) + wrapper en cotizador + extender DocRowCaps/DocumentRow (opt-in) + actualizar links AvanceEntregaCard→historial.
- B: en features/remisiones: componente OrdenPicker + DrawerBorradoresRemision (Drawer primitive + listado de borradores del historial filtrado estado=borrador) + preparación de store (modo orden/libre conmutables en runtime).

**Ola 2 (tras contratos de A y B):**
- C: RemisionEditorPage ensamblando todo + HeaderRemision + rutas/redirects/nav-config + actualizar consumidores (Seguimiento, RemisionesPage botones, retiro de CrearRemisionPage o su reducción a redirect).

**Cierre:** validación completa, commits por ola, push, deploy monitorizado, actualización del artifact de Novedades.
