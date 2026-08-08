# Guion de QA manual — Remisiones v2

Material de trabajo local para validar con Axel. No se commitea (docs/superpowers/ está gitignorado en este repo).

Rama: `feat/remisiones-v2`. Antes de empezar: levantar la app con el `dist/` recién regenerado (`chore(build): regenerar dist (remisiones v2)`) y tener usuarios de prueba con roles `ADMINISTRADOR` (o `GERENTE_COMERCIAL`), `VENTAS` (al menos dos, v1 y v2, para probar owner-scoping) y `OPERATIVO`.

Convenciones usadas abajo:
- Estados de una remisión (BD/API en minúscula, UI los muestra en mayúscula): `borrador`, `emitida`, `recibida`, `cancelada`.
- Roles: `ADMINISTRADOR`/`SUPERADMIN` (acceso total), `GERENTE_COMERCIAL` (gestión completa de remisiones, incluida sobre-entrega y recepción), `VENTAS` (crea/edita/emite solo lo propio, sin cancelar ni sobre-entrega), `OPERATIVO` (solo lee emitidas/recibidas y recibe).
- Rutas: listado en `/spa/remisiones`; creación/edición de borrador en `/spa/remisiones-nueva` (con `?orden=<id>` para partir de una orden, `?libre=1` para modo libre tras elegir cliente, o `/spa/remisiones/:id/editar` para reabrir un borrador existente); avance de entrega dentro del cotizador en `/spa/cotizador?edit=<ordenId>` (solo visible si la orden ya no está en estatus `COTIZACION`).
- No hay ruta de "detalle" separada: el detalle de una remisión es un modal dentro de `/spa/remisiones` (se puede abrir directo con `/spa/remisiones?ver=<id>`).

---

## Caso 1 — Remisión manual, 1 partida

**Rol:** VENTAS (v1).

1. Ir a `/spa/remisiones` → botón "Nueva remisión" (o directo a `/spa/remisiones-nueva`).
2. Elegir "Nueva libre" (sin orden) → seleccionar un cliente en el picker → se navega a `/spa/remisiones-nueva?libre=1`.
3. Elegir moneda (obligatoria en modo libre).
4. Agregar **una sola** línea (producto de catálogo o producto fantasma), cantidad y unidad.
5. Guardar el borrador (queda en estado `borrador`, sin folio todavía).
6. Click "Emitir".

**Resultado esperado:** al emitir, la remisión pasa a `emitida` y se le asigna folio con formato `R-YYMM####`. El borrador ya no es editable. Se abre automáticamente el HTML imprimible (`GET /api/remisiones/{id}/imprimir`), sin overlay de "BORRADOR".

---

## Caso 2 — Remisión manual, varias partidas

**Rol:** VENTAS (v1).

1. Igual que el caso 1, pero agregar 3–4 líneas con distintos productos/cantidades/unidades en el mismo borrador libre.
2. Guardar, revisar que la tabla de partidas muestre todas las líneas correctamente (unidad snapshot por partida, cantidades con hasta 3 decimales).
3. Emitir.

**Resultado esperado:** las 4 líneas quedan en la remisión emitida con su unidad real (no genérica), folio asignado, documento imprimible/Word reflejan todas las partidas.

---

## Caso 3 — Remisión desde cotización completa

**Rol:** VENTAS (v1), dueño de una orden ya no-cotización con partidas 100% pendientes.

1. Ir a `/spa/cotizador?edit=<ordenId>` de una orden propia.
2. En la tarjeta de Avance de Entrega, click "Nueva remisión" → navega a `/spa/remisiones-nueva?orden=<ordenId>`.
3. El formulario se hidrata con `GET /api/remisiones/orden/{orden_id}/borrador`: trae cada `DetalleOrden` con lo ya entregado y lo pendiente.
4. Dejar **todas** las partidas incluidas, con la cantidad "a entregar" igual al pendiente completo (valor por defecto).
5. Guardar y emitir.

**Resultado esperado:** remisión emitida cubre el 100% de lo pendiente de la orden. Al volver a `/spa/cotizador?edit=<ordenId>`, la tarjeta de Avance de Entrega muestra las partidas como `ENTREGADA` (pendiente = 0).

---

## Caso 4 — Remisión con partidas seleccionadas (parcial por selección)

**Rol:** VENTAS (v1), misma orden del caso 3 u otra con varias partidas.

1. Desde el Avance de Entrega, "Nueva remisión" → `/spa/remisiones-nueva?orden=<ordenId>`.
2. En `PartidasSeleccionTable`, **desmarcar** el checkbox "Incluir" de una o más partidas (dejar solo un subconjunto).
3. Para las partidas incluidas, dejar la cantidad completa a entregar.
4. Guardar y emitir.

**Resultado esperado:** la remisión emitida solo contiene las partidas marcadas; las no marcadas no aparecen. En Avance de Entrega, esas partidas excluidas siguen con estado `NO_ENTREGADA` o `PARCIAL` según corresponda, y las incluidas pasan a `ENTREGADA`.

---

## Caso 5 — Entrega parcial (cantidad menor al pendiente)

**Rol:** VENTAS (v1).

1. Desde una orden con una partida de, por ejemplo, cantidad pendiente 10, crear remisión vía `/spa/remisiones-nueva?orden=<ordenId>`.
2. En la línea de esa partida, cambiar "A entregar" a un valor menor al pendiente (p. ej. 4).
3. Guardar y emitir.

**Resultado esperado:** remisión emitida con cantidad 4. En Avance de Entrega, esa partida queda con estado `PARCIAL`, "Entregado" = 4, "Pendiente" = 6.

---

## Caso 6 — Segunda entrega parcial (acumulado)

**Rol:** VENTAS (v1), continuación del caso 5 sobre la misma orden/partida (pendiente ahora = 6).

1. Volver a `/spa/cotizador?edit=<ordenId>` → Avance de Entrega → "Nueva remisión" → `/spa/remisiones-nueva?orden=<ordenId>`.
2. El borrador debe traer el pendiente **actualizado** (6, no 10) para esa partida — el cálculo usa `pendientes_por_detalle`, que solo cuenta remisiones `emitida`/`recibida` (no `cancelada` ni `borrador`).
3. Entregar los 6 restantes (o una cantidad menor, p. ej. 3, para dejar un tercer pendiente).
4. Guardar y emitir.

**Resultado esperado:** el acumulado de entregas por partida suma correctamente entre remisiones (4 + 6 = 10, o 4 + 3 = 7 pendiente 3). Avance de Entrega refleja el acumulado real, no solo la última remisión. El historial de remisiones de la orden (dentro de Avance de Entrega) muestra ambas remisiones con link a `/spa/remisiones?ver=<id>`.

---

## Caso 7 — Intento de exceder el pendiente sin rol de sobre-entrega → bloqueado

**Rol:** VENTAS (v1, sin permiso `sobreentrega`).

1. Crear/editar un borrador desde una orden con un pendiente conocido (p. ej. pendiente = 3).
2. Poner "A entregar" en un valor mayor al pendiente (p. ej. 10) — el input de `PartidasSeleccionTable` **no** topa automáticamente al pendiente, así que esto es posible de capturar en el formulario.
3. Guardar el borrador (el guardado no valida sobre-entrega, solo `emitir` lo hace).
4. Click "Emitir".

**Resultado esperado:** `POST /api/remisiones/{id}/emitir` responde **400** (no 403) con detalle `{"mensaje": "Cantidad mayor al pendiente y sin permiso de sobre-entrega", "excesos": [...]}`. En la UI aparece un panel ámbar debajo de la barra de totales listando, por partida, cotizado/pendiente/solicitado. La remisión **permanece en `borrador`** (no se emite, no se descuenta pendiente).

**Repetir con GERENTE_COMERCIAL o ADMINISTRADOR** sobre el mismo borrador (o uno equivalente): la emisión debe **permitirse**, y la remisión emitida debe registrar `sobre_entrega_autorizada_por_id` = el usuario que autorizó (verificable en el detalle/backend; no necesariamente visible en UI, pero confirmar que no hay error).

---

## Caso 8 — Documentos PDF/Word con unidades reales

**Rol:** VENTAS (dueño) o ADMINISTRADOR.

1. Sobre una remisión ya `emitida` (de cualquier caso anterior con unidades no genéricas, p. ej. "PZA", "KG", "M"), abrir el detalle en `/spa/remisiones?ver=<id>`.
2. Click "Imprimir"/"PDF" → se abre `GET /api/remisiones/{id}/imprimir` (HTML imprimible; usar Ctrl+P → "Guardar como PDF" del navegador para obtener el PDF).
3. Verificar que cada partida muestra su **unidad real** (no un placeholder genérico) y los datos de branding de la empresa (logo/nombre configurados).
4. Click "Word" → descarga `.docx` vía `GET /api/remisiones/{id}/word`. Abrir y verificar las mismas unidades y branding.
5. Repetir sobre una remisión que **siga en `borrador`** (si el rol lo permite ver/imprimir borradores — VENTAS dueño sí puede):
   - HTML: debe verse el overlay diagonal rojo "BORRADOR" superpuesto.
   - Word: el subtítulo debe llevar el prefijo "BORRADOR — SIN VALIDEZ · ...".
6. Repetir el HTML de una remisión emitida y confirmar que **no** lleva la marca de agua.

**Resultado esperado:** unidades correctas en ambos formatos, branding configurable presente, marca de agua solo en borradores (HTML con overlay, Word con prefijo textual), nunca en emitidas.

---

## Caso 9 — Historial filtrado

**Rol:** ADMINISTRADOR o VENTAS (ver alcance según rol en Caso 11).

1. Ir a `/spa/remisiones`.
2. Probar el buscador libre (folio o nombre de cliente) — debe filtrar con debounce (~300ms).
3. Probar el select de estado: `todas | borrador | emitida | recibida | cancelada`. Confirmar que cada opción filtra correctamente contra `GET /api/remisiones/`.
4. Probar el rango de fechas "Desde"/"Hasta" y confirmar que acota el listado por fecha de emisión/creación.
5. Confirmar paginación (50 por página en la UI).

**Resultado esperado:** cada filtro (texto, estado, rango de fechas) reduce el listado de forma consistente y combinable. Nota: la UI no expone filtro por orden ni por vendedor (existen en el backend pero no en pantalla) — no hace falta probarlos manualmente aquí, ya cubiertos por tests automatizados.

---

## Caso 10 — Remisión → cotización

**Rol:** VENTAS (dueño) o ADMINISTRADOR/GERENTE_COMERCIAL, sobre una remisión en estado `emitida` o `recibida`.

1. Abrir el detalle de la remisión en `/spa/remisiones?ver=<id>`.
2. Confirmar que el botón "Crear cotización" solo aparece si el estado es `emitida` o `recibida` (no en `borrador` ni `cancelada`).
3. Click "Crear cotización".

**Resultado esperado:** se crea una nueva orden/cotización (snapshot completo de las partidas de la remisión, incluyendo servicio si aplica) vía `POST /api/remisiones/{id}/crear-cotizacion`, y la UI navega a `/spa/cotizador?edit=<orden_venta_id_nuevo>`. Repetir el click una segunda vez sobre la misma remisión: debe crear **otra** cotización distinta (comportamiento intencional, no bloqueado).

---

## Caso 11 — Permisos por rol (VENTAS no ve ajenas, OPERATIVO solo recibe)

**Preparación:** dos usuarios VENTAS (v1 y v2) y un usuario OPERATIVO.

**11a — VENTAS no ve/edita remisiones ajenas:**
1. Como v1, crear y emitir una remisión (borrador propio).
2. Como v2, ir a `/spa/remisiones`: la remisión de v1 sobre una orden ajena a v2 **no** debe aparecer en el listado (403/filtrado).
3. Si la orden es compartida (v2 puede ver la orden pero no creó la remisión), v2 sí puede **leer** la remisión en el historial de Avance de Entrega de esa orden, pero no debe poder editarla ni emitirla (esperar 403 al intentar `PUT` o `emitir` desde la UI, botones deshabilitados o error al forzar).
4. Como v2, intentar emitir directamente una remisión creada por v1 (vía URL directa a editar `/spa/remisiones/<id>/editar` si el id se conoce): debe fallar con 403.

**11b — OPERATIVO solo recibe:**
1. Como OPERATIVO, ir a `/spa/remisiones`: no debe existir el botón "Nueva remisión" (o debe fallar con 403 si se fuerza `POST /api/remisiones/`).
2. El listado, sin filtro explícito de estado, debe mostrar **solo** `emitida` y `recibida` — nunca `borrador` ni `cancelada`. Si OPERATIVO intenta forzar `?estado=borrador` en la URL, debe recibir 403.
3. Sobre una remisión `emitida`, OPERATIVO debe poder click "Recibir" (`PATCH /api/remisiones/{id}/recepcion`, campo `recibido_por` obligatorio) → pasa a `recibida`.
4. OPERATIVO intentando "Imprimir" o "Word" de una remisión en `borrador` o `cancelada` (por URL directa) debe recibir **404** (no 403 — se oculta la existencia).
5. OPERATIVO no debe tener acceso a "Cancelar" ni a "Crear cotización" ni a "Emitir" (esas acciones no deben aparecer en su UI).

**11c — GERENTE_COMERCIAL gestión completa:**
1. Como GERENTE_COMERCIAL, confirmar que puede crear/emitir/cancelar/sobre-entregar/convertir cualquier remisión.
2. Confirmar que también puede registrar recepción (`PATCH /api/remisiones/{id}/recepcion` → 200, pasa a `recibida`) — ajuste de la ola final (I-1): la matriz del spec §6 le concede recepción.

**Resultado esperado:** cada punto arriba se cumple exactamente como se describe; ningún rol se filtra información ni acciones fuera de su alcance.

---

## Caso 12 — Concurrencia: dos usuarios emitiendo a la vez sobre la misma orden

**REQUIERE POSTGRES REAL — no se puede validar en este ambiente si corre sobre SQLite.** Los advisory locks (`pg_advisory_xact_lock`) usados en `emitir`/`cancelar`/`registrar_recepcion`/`crear_cotizacion_desde` (`app/services/folio_service.py:pg_locker`) son funciones SQL exclusivas de Postgres; en SQLite no existen y el locking real no se ejerce (los tests automatizados usan un locker no-op explícitamente por esto).

**Preparación:** ambiente apuntando a una base Postgres real (no la SQLite de desarrollo/tests), con una orden que tenga una única partida con pendiente ajustado (p. ej. pendiente = 5).

1. Abrir dos sesiones de navegador (o dos pestañas con dos usuarios/tokens distintos, p. ej. v1 y ADMINISTRADOR) sobre borradores **distintos** que ambos apuntan a la **misma orden** y a la **misma partida**, cada uno pidiendo entregar 5 (el total del pendiente).
2. Disparar "Emitir" en ambas sesiones lo más simultáneamente posible (idealmente con un script que dispare las dos requests `POST /api/remisiones/{id}/emitir` en paralelo, o dos clicks manuales muy seguidos).

**Resultado esperado:**
- Solo **una** de las dos emisiones debe tener éxito (pasa a `emitida`, descuenta el pendiente correctamente).
- La segunda debe fallar con **409** (re-check tras el lock detecta que el pendiente ya no alcanza) — nunca debe permitir sobre-descontar ni dejar el pendiente en negativo.
- Verificar en BD que el acumulado de entregas de la partida no excede lo cotizado (salvo autorización de sobre-entrega, que no aplica aquí).
- Repetir análogamente para dos cancelaciones simultáneas de la misma remisión (`cancelar`) y confirmar que solo una transición ocurre y la segunda da 409, sin duplicar la reversa de stock.

Este caso queda pendiente de ejecución hasta contar con un ambiente Postgres real; documentar el resultado por separado cuando se corra.

---

## Limitación conocida — M-4: remisiones libres no descuentan stock

Con `stock_evento_descuento='remision'`, el descuento de stock en `emitir()`
(`_descontar_stock` en `app/domains/remisiones/service.py`) solo revisa
`det.detalle_orden.producto` — es decir, únicamente líneas **ligadas a una
orden** (`detalle_orden_id` no nulo) que además esa orden traiga
`producto_id` de catálogo. Las remisiones **libres** (modo `cliente_id`, sin
orden) y cualquier línea **ad-hoc** dentro de una remisión-desde-orden (sin
`detalle_orden_id`, o cuyo `DetalleOrden` no tiene `producto_id`) nunca
mueven kardex, aunque describan un producto que sí existe en el catálogo —
no hay forma de que el usuario asocie esa línea a un `Producto` real desde
el formulario libre.

Efecto práctico: si Operaciones emite una remisión libre para sacar
mercancía de catálogo del almacén (caso frecuente en mostrador/entregas
directas sin cotización previa), `stock_actual` no se mueve y no queda
`movimientos_stock` — el inventario del sistema queda desalineado del físico
hasta el próximo ajuste manual. No es un bug de esta ola de fixes: es una
limitación de alcance de Remisiones v2 (M-5 relacionado también quedó fuera:
sobre-entrega en `convertir:own`). Ticket futuro: permitir vincular
`producto_id` a líneas libres/ad-hoc y extender `_descontar_stock` para
cubrir ese caso.
