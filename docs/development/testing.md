# Testing

El repo tiene **dos suites**: pytest para el backend y Vitest para la lógica pura del frontend. Ambas corren en **CI** (`.github/workflows/ci.yml`, en cada push a `main` y en cada pull request) y se pueden correr a mano antes de cada push.

## Cómo correr

```bash
# Backend  (instalar dependencias de desarrollo una sola vez)
pip install -r requirements-dev.txt
pytest -q                       # modo SQLite (rápido, sin infraestructura)

# Backend contra PostgreSQL real (lo mismo que hace CI)
docker run -d --name atlas-test-pg -p 5433:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=atlas_test postgres:16
export TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5433/atlas_test
pytest -q

# Frontend
cd web
npm run test          # corrida única
npm run test:watch    # modo watch
npm run typecheck     # tsc -b --noEmit (CI también corre `npm run build`)
```

Config: `pytest.ini` (`testpaths = tests`, marcador `postgres`) y `web/vitest.config.ts`. El entorno por defecto es `node` —más rápido y suficiente para la lógica pura—; los archivos que **montan componentes React** declaran `// @vitest-environment jsdom` en su primera línea. Alias `@` espejado de `vite.config.ts`; patrón `src/**/*.test.ts` y `.tsx`. Los tests del frontend viven junto al código que cubren.

## Modo dual del backend: SQLite o PostgreSQL

`tests/conftest.py` elige el motor según **`TEST_DATABASE_URL`**:

| | Sin `TEST_DATABASE_URL` (default local) | Con `TEST_DATABASE_URL` (CI) |
|---|---|---|
| Motor | SQLite en memoria, base nueva por test | La base PostgreSQL que apuntes |
| Esquema | `create_all()` | `alembic upgrade head`, con fallback documentado abajo |
| `pg_advisory_xact_lock` / `hashtext` | parcheadas a no-op | **funciones reales** — sin parches |
| Aislamiento entre tests | base nueva cada vez | `DELETE` de todas las tablas + reinicio de secuencias |
| Tests `@pytest.mark.postgres` | omitidos con razón explícita | se ejecutan |
| Duración | ~4 s | ~6 s |

En modo Postgres, `DATABASE_URL` se reapunta a la base de pruebas antes de importar `app`, así que el engine de `app.db.session` (y cualquier `SessionLocal()` suelto del código de producción, p. ej. en `ventas.py`) hablan con la misma base efímera.

**Por qué se limpia con `DELETE` y no envolviendo cada test en una transacción con rollback.** El rollback es más elegante, pero rompería justo lo que este modo existe para probar: los `COMMIT` tienen que ser reales porque (a) `pg_advisory_xact_lock` se libera al terminar la transacción, así que una transacción-envoltorio falsearía la vida del lock; (b) las pruebas de concurrencia abren una **segunda conexión**, que no vería nada sembrado dentro de una transacción sin confirmar; y (c) parte del código de producción abre sus propias sesiones. El `DELETE` de las ~47 tablas en una sola transacción cuesta ~6 ms — se difieren las FKs para que el ciclo `ordenes_venta ↔ remisiones` no imponga un orden imposible, y se reinician las secuencias para que los ids arranquen en 1 como en SQLite. (Un `TRUNCATE ... CASCADE` equivalente cuesta ~0.9 s por test: un minuto por corrida.)

**Salvaguarda:** la suite rechaza una `TEST_DATABASE_URL` cuya base no tenga `test` en el nombre (borra el esquema y vacía todas las tablas). Para saltarla, `TEST_DATABASE_ALLOW_ANY=1`. Para reutilizar el esquema entre corridas y ahorrar el arranque, `TEST_DATABASE_RESET=0`.

### El marcador `postgres`

```python
@pytest.mark.postgres
def test_dos_sesiones_no_consumen_el_mismo_saldo(pg_engine): ...
```

Se salta solo en modo SQLite, con la razón impresa (`pytest -rs` para verla). Es donde van las pruebas de concurrencia de la Ola 0: cualquier test que abra **dos conexiones**, dependa de **advisory locks**, de DDL de migraciones o de la estrictez SQL de Postgres. Fixtures disponibles: `pg_engine` (engine de sesión) además de los de siempre (`db`, `usuario`, `client_as`).

## Qué cubre hoy

### Backend — `tests/`

| Archivo | Cubre |
|---|---|
| `test_remisiones_service.py` | Ciclo de vida: emisión con validación de pendientes, sobre-entrega autorizada por permiso, cancelación con reversa de stock, conversión a cotización, carrera con lock |
| `test_remisiones_api.py` | Contratos HTTP: permisos por rol, owner-scoping, restricciones del rol operativo, borrador con pendientes, avance de entrega, 400/409 vs 500 |
| `test_remisiones_repository.py` | Acumulados de entrega por partida (solo cuentan los estados que entregan) |
| `test_remisiones_documents.py` | Render de plantilla: escape XSS, marcas de agua de borrador y cancelada, línea de recepción |
| `test_remision_modelo.py` | Estado inicial y persistencia del enum |
| `test_folio_service.py` | Consecutivo, incremento y reinicio mensual |
| `test_formato.py` | `fmt_cantidad`: enteros sin decimales, máximo 2, redondeo de display |
| `test_stock_decimal_guard.py` | Rechazo de cantidades fraccionarias en movimientos de stock |
| `test_unidades.py` | Catálogo de unidades y snapshot de unidad por partida |
| `test_postgres_mode.py` | Solo en modo Postgres: que `hashtext`/`pg_advisory_xact_lock` sean reales y que el lock serialice de verdad dos conexiones |
| `test_remisiones_concurrencia.py` | Solo en modo Postgres: **UAT-05** — dos remisiones que piden el mismo pendiente a la vez (una emite, la otra recibe 400) y cuatro emisiones simultáneas sin repetir folio |
| `test_cobranza_concurrencia.py` | Solo en modo Postgres: dos pagos simultáneos contra el mismo saldo. **Encontró un bug real de producción** — ver abajo |
| `test_cobranza_fifo.py` | Reparto de un pago entre cargos abiertos: orden por vencimiento, un pago que cubre varios, sobrante que no infla ningún cargo, orden explícito por encima del FIFO, y transiciones pendiente/parcial/pagado/vencido |
| `test_ventas_totales.py` | Espejo de `calc.test.ts` contra el endpoint real: costo+utilidad, descuento, suma de líneas, redondeo **por línea** antes de sumar, medio centavo, y USD sin TC rechazado. **Encontró una divergencia de redondeo** — ver abajo |
| `test_fechas_negocio.py` | Que "hoy" sea el día del **negocio** y no el de UTC. Determinista con zonas a 25 h de distancia, que nunca comparten fecha |
| `test_ventas_recotizar.py` | Versionado: `V2`, `V3` sin encadenar sufijos, vínculo en estrella a la raíz, y que la versión no gaste el consecutivo mensual |
| `test_cobranza_aging.py` | Tramos de antigüedad: reparto, los tres bordes (30/31, 60/61, 90/91) por sus dos lados, saldo pendiente y no monto original, y `marcar_vencidos` |
| `test_stock_service.py` | Rastro auditable: cada movimiento deja fila con su `stock_resultante`, el kardex reconstruye el stock paso a paso, guard de negativo, y el ciclo de reservas (reservar no toca el stock físico; solo cuentan las cotizaciones vivas) |
| `test_endpoints_autenticacion.py` | Barrido de **todas** las rutas montadas: ninguna responde sin credenciales salvo login y logout |

### Frontend — `web/src/features/cotizador/`

- **`lib/calc.test.ts`** — el motor de dinero (100% funciones puras): `convertCost` y `convertCostDOF` (tasa de venta vs DOF puro para costo de OC), `lineImporte` (costo + utilidad, descuento al cliente, multimoneda, bordes), `computeTotals` (subtotal/IVA/total con **redondeo a 2 decimales por línea antes de sumar**, espejo del `quantize` del backend), `computeCostos` (margen $ y %, incluido el margen que viene solo del spread del TC), `computeTotalsPorMoneda` y `resolveDirectionalTcs`.
- **`store.test.ts`** — hidratación del cotizador y comportamiento del TC al cambiar la moneda del documento.

**Convención:** cada valor esperado está derivado a mano con la aritmética documentada en un comentario junto al assert. Nunca copiar el output de la función como expected (test tautológico).

**Fechas en las pruebas del backend: usa `hoy_negocio()`, nunca `date.today()`.** CI corre en **UTC** y el código resuelve el día con la zona del negocio (`app/core/fechas.py`), así que una prueba que tome el día del runner concuerda en un equipo en CDMX y falla en CI durante las horas en que UTC va por delante — o al revés. Ya pasó: dos pruebas de cobranza verdes en local tumbaron el pipeline. **CI se queda en UTC a propósito**, porque esa discrepancia es justo lo que hace visible el bug.

> **Modelo de TC vigente (2026-08-04):** USD→MXN usa `DOF + tolerancia`; MXN→USD usa `DOF − tolerancia` — la tolerancia protege a DASIC de la volatilidad en ambas direcciones. Se resuelve en espejo en `calc.ts::resolveDirectionalTcs` y `ventas.py::_resolve_directional_tcs`: al tocar uno hay que tocar el otro y actualizar estos tests. (El "modelo unificado" de una sola tasa, vigente entre junio y agosto de 2026, quedó sustituido.)

## Estado de las brechas del modo SQLite

Las tres brechas históricas se cierran con el modo Postgres + CI (Ola 0 del plan `docs/superpowers/specs/2026-08-05-golden-path-remisiones-facturacion-design.md`):

- ✅ **Concurrencia real de folios y saldos** — en CI los advisory locks son reales; ya no hay parche. `test_remisiones_concurrencia.py` cubre **UAT-05**: dos hilos, dos conexiones y una barrera que los cita justo antes del lock de orden, así que ambos leerían el mismo pendiente si el lock no existiera. Se verificó por mutación que la prueba **falla** al quitar el lock (entrega 20 sobre una orden de 10), que es lo único que distingue una prueba de concurrencia de una tautología verde.
- ✅ **Estrictez de Postgres** — la suite corre contra PostgreSQL 16 en cada push y PR, así que un `GROUP BY` inválido (el caso `f501338`, que tumbó gastos en producción) sale en CI y no en producción. Al migrar la suite ya apareció un caso: dos tests borraban una remisión con SQL crudo y SQLite lo aceptaba porque **no valida foreign keys**; Postgres lo rechazó.
- ⚠️ **Migraciones — parcialmente, y menos grave de lo que suena**. La cadena de Alembic **no es autocontenida**: la primera revisión (`20260428_01`) hace `ALTER TABLE productos …` sobre tablas que ninguna revisión crea, porque Alembic se adoptó cuando producción ya existía. `alembic upgrade head` sobre una base vacía falla, así que el conftest lo intenta y, si no se aplicó **ninguna** revisión, cae al bootstrap de producción (`create_all` + `_BACKFILL_DDL` + `alembic stamp head`) y lo anuncia al final de la corrida. Si la cadena falla **a media corrida** (una migración nueva rota) no hay red: CI se pone en rojo.

  Lo que atenúa la brecha: **el despliegue tampoco corre Alembic**. El `Procfile` arranca uvicorn directo y el esquema lo construyen `create_all` + `_BACKFILL_DDL` en el lifespan — el propio `app/core/lifespan.py` lo dice. O sea que el camino de esquema que CI ejercita (el fallback) **es el de producción**, y la cadena de migraciones es hoy documentación del cambio, no el mecanismo de despliegue.

  **Cerrarla del todo cuesta más de lo que parece:** son 53 revisiones, y la revisión base tendría que reproducir el esquema de *abril de 2026* —no el actual— para que los `ALTER` posteriores encuentren lo que esperan. Las dos salidas reales son reconstruir ese esquema histórico, o aplastar la historia en una sola revisión y re-estampar producción. La segunda es más barata pero toca `alembic_version` en producción y borra el historial: es una decisión de producto, no una tarea de limpieza. Mientras Alembic no sea el mecanismo de despliegue, el retorno es bajo.

## CI

`.github/workflows/ci.yml` — dispara en push a `main` y en cada pull request; solo valida, **no despliega** (Railway autodespliega desde `main` por su cuenta).

- **Job `backend`** — servicio `postgres:16` con healthcheck, Python de `runtime.txt`, caché de pip, `pip install -r requirements-dev.txt`, `TEST_DATABASE_URL` apuntando a la base efímera `atlas_test` y `pytest -q`.
- **Job `frontend`** — Node 22, caché de npm, `npm ci && npm run typecheck && npm run test && npm run build`.

Los dos jobs corren en paralelo. Para reproducir el job de backend en local, exporta la misma `TEST_DATABASE_URL` contra un `postgres:16` en docker (ver "Cómo correr").

## Qué falta cubrir

Por valor descendente:

0. ~~**Concurrencia de cobranza**~~ ✅ **Cubierta, y encontró un bug real.** `aplicar_pago` serializa con `SELECT ... FOR UPDATE` sobre el cliente, y el lock funcionaba — pero los routers cargan el cliente **antes** de llamar al servicio, así que la instancia ya vivía en el identity map de la sesión con el saldo leído antes de esperar el lock. SQLAlchemy devolvía ese objeto **sin refrescar sus atributos**, de modo que el saldo nuevo se calculaba sobre el valor viejo y el segundo pago pisaba al primero: dos pagos de 600 sobre una deuda de 1000 dejaban el saldo en 400 en vez de −200, sin error visible. Se corrigió con `populate_existing()`. **El lock estaba bien puesto; el bug era que no bastaba** — la clase de defecto que ninguna revisión de código detecta y solo aparece con dos conexiones reales.
1. ~~**Totales de venta en el backend**~~ ✅ **Cubiertos** (`test_ventas_totales.py`), y encontraron una divergencia real: `Decimal.quantize` usa **ROUND_HALF_EVEN** por defecto y `Math.round` de JS es **HALF-UP**. En importes que caen exactamente en medio centavo el usuario aprobaba en pantalla un número y se guardaba otro — 1 de costo con 12.5% de utilidad da 1.125, que el cotizador muestra 1.13 y el backend guardaba 1.12. Se alineó el backend al cotizador con un helper `_money()` (HALF-UP), porque es lo que el usuario aprueba y lo que espera la práctica comercial. **Falta todavía:** folios y versionado de recotizaciones.
2. ~~**Cobranza FIFO**~~ ✅ **Cubierta** (`test_cobranza_fifo.py`, 11 casos). Validada por mutación: invertir el orden, quitar el tope por saldo del cargo o romper la guarda de 'pagado' hacen fallar la suite. **Queda el aging** (`calcular_aging`, `top_deudores`, `listar_vencimientos`), que son agregados de reporte y no reparto de dinero.

   > **Pregunta para administración:** el orden usa `nullsfirst()`, así que un cargo **sin fecha de vencimiento se cobra antes que uno ya vencido**. Puede ser deliberado o un efecto colateral. El comportamiento vigente quedó fijado en una prueba para que no cambie sin que nadie lo note, pero conviene confirmarlo.
3. ~~**`stock_service.aplicar_movimiento`**~~ ✅ **Cubierto** (`test_stock_service.py`, 10 casos). Validado por mutación: quitar el guard de negativo, hacer que RESERVA mueva stock físico, ignorar el estatus de la cotización al sumar reservas o quitar el tope a 0 hacen fallar la suite.
4. ~~**Componentes React**~~ 🔵 **Harness listo y primeras pruebas escritas.** jsdom + Testing Library (`form-field.test.tsx`, `query-error.test.tsx`). Las consultas van **por rol y por nombre accesible**, nunca por clase CSS: así la prueba falla cuando se rompe la accesibilidad, no cuando cambia el diseño. Encontraron dos defectos reales —ver abajo—. **Falta:** el carrito del cotizador y los formularios de entidad completos.

   Las primeras pruebas de componente destaparon dos cosas que no se ven leyendo el JSX: `FormField` mostraba el mensaje de error **solo visualmente** (sin `aria-invalid` ni `aria-describedby`, así que al enfocar el campo un lector de pantalla no anunciaba nada y el campo parecía válido), y `QueryError` ponía `role="alert"` **sobre el `<td>`**, lo que sobreescribe su rol implícito de celda y saca la fila de la semántica de tabla. Ambos corregidos.

> El sistema es **mono-tenant**: no hay aislamiento por organización que probar. Lo que sí conviene cubrir es el **owner-scoping** por rol (que un usuario de ventas no vea documentos ajenos), como ya hace `test_remisiones_api.py`.
