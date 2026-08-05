# Testing

El repo tiene **dos suites**: pytest para el backend y Vitest para la lógica pura del frontend. Ninguna corre automáticamente — **no hay CI**; se ejecutan a mano antes de cada push.

## Cómo correr

```bash
# Backend  (instalar dependencias de desarrollo una sola vez)
pip install -r requirements-dev.txt
pytest -q

# Frontend
cd web
npm run test          # corrida única
npm run test:watch    # modo watch
```

Config: `pytest.ini` (`testpaths = tests`) y `web/vitest.config.ts` (entorno `node` — sin jsdom, no se testean componentes React todavía; alias `@` espejado de `vite.config.ts`; patrón `src/**/*.test.ts`). Los tests del frontend viven junto al código que cubren.

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

### Frontend — `web/src/features/cotizador/`

- **`lib/calc.test.ts`** — el motor de dinero (100% funciones puras): `convertCost` y `convertCostDOF` (tasa de venta vs DOF puro para costo de OC), `lineImporte` (costo + utilidad, descuento al cliente, multimoneda, bordes), `computeTotals` (subtotal/IVA/total con **redondeo a 2 decimales por línea antes de sumar**, espejo del `quantize` del backend), `computeCostos` (margen $ y %, incluido el margen que viene solo del spread del TC), `computeTotalsPorMoneda` y `resolveDirectionalTcs`.
- **`store.test.ts`** — hidratación del cotizador y comportamiento del TC al cambiar la moneda del documento.

**Convención:** cada valor esperado está derivado a mano con la aritmética documentada en un comentario junto al assert. Nunca copiar el output de la función como expected (test tautológico).

> **Modelo de TC vigente (2026-08-04):** USD→MXN usa `DOF + tolerancia`; MXN→USD usa `DOF − tolerancia` — la tolerancia protege a DASIC de la volatilidad en ambas direcciones. Se resuelve en espejo en `calc.ts::resolveDirectionalTcs` y `ventas.py::_resolve_directional_tcs`: al tocar uno hay que tocar el otro y actualizar estos tests. (El "modelo unificado" de una sola tasa, vigente entre junio y agosto de 2026, quedó sustituido.)

## Limitación importante: SQLite en el backend

`tests/conftest.py` levanta la suite sobre **SQLite en memoria** y parchea como no-op las funciones exclusivas de Postgres (`pg_advisory_xact_lock`, `hashtext`). Es rápido y no necesita infraestructura, pero **contradice la regla del repo de usar solo PostgreSQL** y deja fuera justo lo que más duele:

- **Concurrencia real de folios** — los advisory locks son no-op en las pruebas: la garantía de consecutivo irrepetible bajo carga no se verifica.
- **Migraciones** — el esquema se crea con `create_all()`; Alembic y el `_BACKFILL_DDL` nunca se ejecutan, así que el DDL específico (`ALTER COLUMN … TYPE NUMERIC`, defaults de servidor) queda sin probar.
- **Estrictez de Postgres** — un `GROUP BY` que SQLite acepta y Postgres rechaza llegó a producción por esta brecha (`f501338`: el total por moneda tumbó el módulo de gastos completo).

**Siguiente paso recomendado:** contenedor de servicio `postgres:16` en CI, base efímera por sesión y `alembic upgrade head` antes de la suite. Cierra las tres brechas de una vez y habilita correr los tests en cada push.

## Qué falta cubrir

Por valor descendente:

1. **Totales de venta en el backend** (`app/routers/ventas.py`) — tests espejo de `calc.test.ts` con los mismos números, para garantizar que servidor y cliente calculan idéntico (folios, `tipo_cambio` obligatorio en USD, versionado de recotizaciones).
2. **Cobranza FIFO** (`app/services/cuentas_por_cobrar.py`) — aplicación de pagos contra las órdenes más antiguas, saldos parciales, sobrepagos, aging.
3. **`stock_service.aplicar_movimiento`** — que todo movimiento genere fila en `movimientos_stock`, disponible = `stock_actual − reservas activas`, y el ciclo reserva → liberación/consumo.
4. **Componentes React críticos** — hoy ninguno (falta jsdom); candidatos: carrito del cotizador y formularios con validación.

> El sistema es **mono-tenant**: no hay aislamiento por organización que probar. Lo que sí conviene cubrir es el **owner-scoping** por rol (que un usuario de ventas no vea documentos ajenos), como ya hace `test_remisiones_api.py`.
