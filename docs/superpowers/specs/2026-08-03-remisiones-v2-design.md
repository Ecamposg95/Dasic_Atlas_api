# Remisiones v2 — diseño del módulo alineado a arquitectura Atlas

**Fecha:** 2026-08-03
**Fuente:** Spec Scrum del levantamiento con Vania Higuera y Axel (DASIC) + auditoría del repo (Task Pack 1).
**Decisión de enfoque (Emmanuel):** reescritura del módulo como base limpia con patrones Atlas ("Remisiones v2"), reutilizando y evolucionando las tablas existentes — código nuevo, datos continuos, sin tablas paralelas.

## 1. Contexto y problema

El módulo de remisiones existe en producción (modelo propio, 7 endpoints, ~1,285 líneas de SPA, folio `R-YYMM####`, Word + HTML imprimible), pero tiene gaps que bloquean la operación que DASIC pidió:

1. **Sin control de entregas parciales**: la validación compara contra lo cotizado sin restar lo ya remisionado — se puede entregar 10 de 10 tres veces (US-REM-006/BR-05 rotas).
2. **Sin unidad comercial por partida**: el PDF cae a `'PZA'` hardcodeado; las unidades son strings sueltos en `productos.unidad` + lista Python hardcodeada (US-REM-003).
3. **Sin borradores ni estados**: la remisión nace final e inmutable; solo admite una recepción one-shot (US-REM-008).
4. **Sin permisos**: todos los endpoints usan `allow_all_staff`; remisiones no existe en la matriz de permisos.
5. **Sin remisión→cotización** (US-REM-009).
6. **Cantidades enteras**: `Integer` en partidas de orden y remisión — imposible entregar 2.5 m.
7. Código con la deuda típica del repo: plantillas inline en el router, sin capa service, sin tests.

## 2. Decisiones de producto (validadas en brainstorming)

| Tema | Decisión |
| --- | --- |
| Stock | **Híbrido configurable**: flag de plataforma decide si el descuento de inventario ocurre al convertir cotización→venta (comportamiento actual) o al emitir la remisión. |
| Decimales | `cantidad` pasa a **Numeric(12,3)** en `detalles_orden` y `detalles_remision`. |
| Estados | `BORRADOR → EMITIDA → RECIBIDA`, más `CANCELADA` con reversa. |
| Sobre-entrega | Permitida solo con rol elevado (ADMINISTRADOR / GERENTE_COMERCIAL), registrando quién autorizó (BR-05). |
| Unidades | Tabla administrable `unidades_medida` + **snapshot string** por partida (mismo patrón que marca/claves SAT). |
| Permisos | Mapear a roles existentes; recurso `remision` nuevo en la matriz. Sin roles nuevos (RSK-04). |
| Folio | Se mantiene `R-YYMM####` (consecutivo mensual, backend, transaccional). Se asigna **al emitir**, no en borrador. Formato visual por validar con DASIC en refinement. |
| Enfoque | v2 de código (capas Atlas) + evolución de datos (migraciones aditivas sobre las tablas actuales). |

## 3. Arquitectura

```
app/domains/remisiones/
├── models.py       # SQLAlchemy (tablas actuales evolucionadas)
├── schemas.py      # Pydantic, con response_model reales
├── repository.py   # queries puras: acumulados, historial, filtros
├── service.py      # reglas de negocio: emisión, sobre-entrega, cancelación,
│                   #   stock híbrido, conversión a cotización
├── router.py       # HTTP delgado: valida, delega, sin SQL ni plantillas
└── documents.py    # render HTML/Word desde plantillas Jinja2 en archivos
```

Servicios compartidos que nacen aquí (semilla del ciclo documental Atlas, reutilizables por Reporte de Servicio y futuros documentos):

- `app/services/folio_service.py` — generador transaccional genérico (prefijo, reinicio mensual, padding). Hoy existen 4 copias del mismo patrón advisory-lock+MAX+regex; v2 usa el servicio, las demás copias migran después (fuera de alcance de este spec).
- Catálogo de unidades (modelo + endpoints admin en catálogos).

**Reglas de capa**: el router no toca la sesión de SQLAlchemy directamente; el service no conoce HTTP; el repository no contiene reglas de negocio. El lock de folio se inyecta al service (Postgres: `pg_advisory_xact_lock`; tests SQLite: sustituto no-op serializado) para que el dominio sea testeable.

**Tenancy**: el sistema es mono-tenant (migración `20260429_01_drop_multitenant`). v2 no reintroduce `organization_id`; el aislamiento futuro queda confinado a `repository.py`. El branding de documentos sale de `PlatformConfig`/env — nunca hardcodeado (hoy `"DASIC Industrial"` está fijo en el HTML y el .docx).

**Convivencia y cutover**: mismas tablas ⇒ sin migración de datos ni doble historial. El router v2 se monta en `/api/remisiones` reemplazando al viejo en el mismo deploy en que se publica el frontend nuevo (el dist viaja en el repo). Los GET conservan compatibilidad de forma; los POST cambian de contrato (borrador/emisión). El router legacy se elimina en ese mismo cambio — mantenerlo montado duplicaría escrituras sin validación de acumulados.

## 4. Modelo de datos

Todo cambio entra por la **triple vía** obligatoria: modelo SQLAlchemy + migración Alembic + `_BACKFILL_DDL` en `app/db/seeds.py` (Railway no ejecuta Alembic).

### `remisiones` (evoluciona)

- `estado` — TolerantEnum `BORRADOR | EMITIDA | RECIBIDA | CANCELADA`. Backfill: filas con `recibido_at` → `RECIBIDA`; el resto → `EMITIDA`.
- `folio` — pasa a nullable; se asigna al emitir. Unicidad parcial sobre no-nulos. Borradores se muestran "sin folio".
- `emitida_at`, `emitida_por_id` (FK usuarios).
- `cancelada_at`, `cancelada_por_id`, `motivo_cancelacion` (Text, obligatorio al cancelar).
- `sobre_entrega_autorizada_por_id` (FK usuarios, nullable) — evidencia de BR-05.
- `stock_descontado` (bool, default false) — si esta remisión movió inventario; gobierna la reversa al cancelar.

### `detalles_remision` (evoluciona)

- `cantidad` — `Integer` → `Numeric(12,3)` (sin pérdida).
- `unidad` — `String(20)` snapshot, copiada de `productos.unidad` (o capturada libre) al agregar la línea; editable por línea.

### `detalles_orden` (evoluciona)

- `cantidad` — `Integer` → `Numeric(12,3)`.
- `unidad` — `String(20)` snapshot al capturar la partida. El cotizador la muestra; la remisión la hereda como default.

### `unidades_medida` (nueva)

`id`, `nombre` (único), `abreviatura`, `activa` (bool), `orden` (int para el selector). Sembrada con: `DISTINCT productos.unidad` existentes + Pieza, Metro, Caja, Kit, Mes, Servicio. Administrable vía `/api/catalogos/unidades` (CRUD; reemplaza la lista hardcodeada `UNIDADES_SUGERIDAS` y convive con el rename masivo actual).

### `ordenes_venta` (evoluciona)

- `remision_origen_id` (FK `remisiones.id`, nullable) — cotización creada desde una remisión (US-REM-009/BR-08). La remisión original no se modifica.

### Acumulados (no persistidos)

`entregado(detalle_orden_id) = SUM(detalles_remision.cantidad)` sobre remisiones en `EMITIDA | RECIBIDA`. `pendiente = detalle_orden.cantidad − entregado`. Se calcula en `repository.py`; al emitir se recalcula dentro de la transacción con lock. Sin columna desnormalizada: el volumen de DASIC no justifica caché y así no hay descuadres. Canceladas y borradores quedan fuera del acumulado por definición.

### Configuración (`PlatformConfig`)

- `stock_evento_descuento` = `'venta'` (default, comportamiento actual) | `'remision'`.
- Claves de branding para documentos (nombre comercial, dirección, teléfono) — consumidas por `documents.py`.

## 5. Flujos

1. **Crear borrador** — `POST /api/remisiones` con `estado=BORRADOR` implícito; dos modos excluyentes como hoy (desde `orden_venta_id` o libre con `cliente_id`). Desde orden, el service arma las líneas sugiriendo el **pendiente real** por partida; el usuario selecciona partidas (todas/limpiar) y ajusta cantidades y unidades.
2. **Editar borrador** — `PUT /api/remisiones/{id}` solo en `BORRADOR`. Owner-scoped para VENTAS.
3. **Emitir** — `POST /api/remisiones/{id}/emitir`. Transacción única: lock → revalida `cantidad ≤ pendiente` por partida → si excede: exige rol elevado y registra autorizador; si no lo tiene: 400 con detalle `{cotizado, entregado, pendiente}` por partida → asigna folio → `EMITIDA` + `emitida_at/por` → si `stock_evento_descuento='remision'`: descuenta stock y marca `stock_descontado`.
4. **Recepción** — `PATCH /api/remisiones/{id}/recepcion`: `EMITIDA → RECIBIDA` con `recibido_por`/`recibido_at`. One-shot (409 si ya recibida), como hoy.
5. **Cancelar** — `POST /api/remisiones/{id}/cancelar` (rol elevado, motivo obligatorio). Desde `EMITIDA` o `RECIBIDA`. Revierte stock si `stock_descontado`. Los borradores no se cancelan: se eliminan (`DELETE`, solo en `BORRADOR`, dueño o admin).
6. **Remisión→cotización** — `POST /api/remisiones/{id}/crear-cotizacion` (desde `EMITIDA`/`RECIBIDA`): crea orden en `COTIZACION` con `remision_origen_id`, copia cliente/contacto/líneas (código, descripción, cantidad, unidad, partida) **sin precios**; el usuario los completa en el cotizador. Respuesta = id de la orden nueva para navegar.
7. **Historial** — `GET /api/remisiones` con filtros: `q` (folio/cliente), `orden_venta_id`, `estado`, rango de fechas, `creado_por_id`; paginado como el actual.
8. **Avance de entrega** — en el detalle de la orden (`GET /api/ventas/{id}` ampliado o endpoint `avance-entrega`): por partida `{cotizado, entregado, pendiente, estado}` con estado `NO_ENTREGADA | PARCIAL | ENTREGADA`, más la lista de remisiones asociadas con folio, fecha y estado (US-REM-007).
9. **Documentos** — `GET /{id}/imprimir` (HTML) y `GET /{id}/word` como hoy, pero renderizados desde plantillas en archivos, con unidad real por línea, branding desde config y espacios de firma entrega/recepción. Un borrador imprime con marca de agua "BORRADOR" y sin folio.

### Manejo de errores

- Emisión concurrente sobre la misma orden: el lock serializa; el segundo request revalida pendientes ya descontados y falla con 400 detallado si excede (caso QA #12 del Task Pack 6).
- Cancelación con reversa de stock usa la misma transacción — nunca queda stock revertido con remisión activa ni viceversa.
- `TolerantEnum` protege lecturas de datos legacy durante el backfill de `estado`.

## 6. Permisos

Recurso nuevo `remision` en `app/security/permissions.py`:

| Acción | ADMINISTRADOR | GERENTE_COMERCIAL | VENTAS | OPERATIVO |
| --- | --- | --- | --- | --- |
| Crear/editar borrador | ✔ | ✔ | ✔ `:own` | ✖ |
| Emitir | ✔ | ✔ | ✔ `:own` | ✖ |
| Consultar | ✔ | ✔ | `:own` | ✔ (emitidas) |
| Marcar recepción | ✔ | ✔ | ✖ | ✔ |
| Cancelar / autorizar sobre-entrega | ✔ | ✔ | ✖ | ✖ |
| Crear cotización desde remisión | ✔ | ✔ | ✔ | ✖ |
| Administrar unidades | ✔ | ✖ | ✖ | ✖ |

SUPERADMIN hereda todo, como en el resto de la matriz. Mapeo de personas (informativo, no cableado): Vania → GERENTE_COMERCIAL; Axel → VENTAS; Fernando/Alexis → OPERATIVO.

## 7. Frontend

Se rehace `web/src/features/remisiones/` conservando el carrito compartido de documentos (capacidades `showCosto:false`, `showImporte` según `mostrar_precios`):

- **Lista** — badges de estado, filtros del punto 5.7, acceso desde el menú (además `/spa/remisiones-nueva` deja de ser ruta huérfana).
- **Editor de borrador** — modos manual/desde-cotización; tabla de selección de partidas con columnas **cotizado / entregado / pendiente / a entregar**, checkbox por partida + seleccionar todas/limpiar, unidad editable por línea (selector alimentado por `unidades_medida` activas), validación en vivo de pendiente (la sobre-entrega se marca visualmente y solo procede con rol elevado).
- **Detalle** — acciones por estado (editar/eliminar en borrador; emitir; recepción; cancelar; crear cotización; imprimir/Word).
- **Cotización ↔ remisiones** — el detalle de la orden muestra el avance de entrega por partida y enlaza sus remisiones; desde ahí se crea la siguiente remisión parcial.

## 8. Verificación

**Primera suite pytest del repo**, acotada al dominio v2 (el repo hoy no tiene ningún test):

- Unit/integración del service sobre SQLite in-memory con lock inyectado: acumulados y pendientes (parciales sucesivas), bloqueo de sobre-entrega sin rol y autorización con rol, transiciones de estado válidas e inválidas, cancelación con y sin reversa de stock, folio (formato, consecutivo mensual), conversión remisión→cotización (sin precios, referencia, inmutabilidad de la remisión).
- Los 12 casos QA del Task Pack 6 de la spec Scrum como guion de validación manual con Axel (incluye concurrencia real en Postgres, que SQLite no cubre).
- Gate de frontend: `tsc` + build, como es costumbre del repo.

## 9. Fuera de alcance (registrado, no desplazado)

- Los 12 estados del seguimiento comercial (US-COM-001) — la cadena `EstatusOrden` no se toca.
- Órdenes de compra desde cotización (US-OC-001).
- Evidencia fotográfica y firma digital en recepción.
- Plantas/sucursales y dirección de entrega estructurada.
- Repositorio documental (PDFs almacenados).
- Tenancy de datos; migrar los otros 3 generadores de folio al `folio_service`.

## 10. Preguntas que quedan para el refinement con DASIC

1. Formato visual del folio (`R-2608-0001` vs `R-26080001` actual) — solo presentación.
2. ¿La emisión debe notificar a alguien (correo a Vania)?
3. ¿Qué texto legal/pie requiere el documento impreso?
4. Confirmar con Vania el mapeo de roles propuesto en §6.
