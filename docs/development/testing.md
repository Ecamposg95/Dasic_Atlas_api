# Testing

Primer harness de tests del repo (2026-08). Hoy cubre **solo lógica pura del
frontend** — no requiere base de datos ni servidor corriendo.

## Cómo correr los tests

```bash
cd web
npm run test        # corrida única (CI-friendly)
npm run test:watch  # modo watch durante desarrollo
```

Runner: [Vitest] (dev-dependency de `web/`). Config en `web/vitest.config.ts`:
entorno `node` (sin jsdom — no se testean componentes React todavía), alias `@`
espejado de `vite.config.ts`, y patrón de descubrimiento `src/**/*.test.ts`.
Los tests viven junto al código que cubren (colocated), p.ej.
`src/features/cotizador/lib/calc.test.ts` junto a `calc.ts`.

## Qué cubre este harness

`web/src/features/cotizador/lib/calc.test.ts` — el motor de cálculo de dinero
del cotizador (`calc.ts`), que es 100% funciones puras (el módulo solo hace
`import type`, sin stores ni React):

- `convertCost` — conversión costo→divisa de cotización con la tasa de venta
  (DOF + tolerancia): misma moneda, USD→MXN (×), MXN→USD (÷), guard TC ≤ 0.
- `convertCostDOF` — conversión con DOF puro (Costo OC al proveedor, sin spread).
- `lineImporte` — precio extendido por línea: costo + utilidad %, descuento al
  cliente, multimoneda, bordes de utilidad 0 y cantidad decimal.
- `computeTotals` — subtotal/IVA/total del documento, mezcla de líneas MXN+USD,
  y la regla de **redondeo a 2 decimales POR LÍNEA antes de sumar** (igual que
  el `quantize` por línea del backend, para que el preview cuadre con el PDF).
- `computeCostos` — costo real vía DOF con `descuento_proveedor`, margen $ y
  margen % (incluye el caso donde el margen proviene solo del spread del TC),
  guard subtotal 0.
- `computeTotalsPorMoneda` — subtotales nativos por moneda sin aplicar TC.
- `resolveDirectionalTcs` — tasa de venta unificada DOF+tolerancia: default y
  validación de tolerancia, override plausible honrado y espejado, banda de
  plausibilidad [DOF·0.5, DOF·1.5] que descarta sentinelas legacy (0.000001),
  e ignorar el parámetro `_tc_mn_a_usd`.

Convención de los tests: cada valor esperado está **derivado a mano** y la
aritmética queda documentada en un comentario junto al assert. Nunca copiar el
output de la función como expected (test tautológico).

## Estrategia pendiente: backend (pytest)

El backend no tiene tests todavía. El plan cuando se monte:

- **Harness:** `pytest` + `httpx.AsyncClient`/`TestClient` de FastAPI.
- **Base de datos:** las reglas del repo prohíben SQLite/fakes en memoria — los
  tests de backend necesitan un **PostgreSQL de servicio** (Docker
  `postgres:16` local o service container en CI) con una **DB efímera por
  sesión de test**: fixture que crea un database temporal, corre
  `alembic upgrade head` (o `Base.metadata.create_all` mientras dure la
  transición), siembra el tenant base (`seed_base_tenant`) y hace drop al
  terminar. Cada test corre dentro de una transacción con rollback para
  aislamiento. *Nota: en el entorno de desarrollo actual (WSL sin Postgres de
  servicio) esto no es ejecutable — por eso el primer harness fue el frontend.*
- **Candidatos prioritarios (lógica de dinero):**
  1. Totales de `app/routers/ventas.py` — recálculo servidor de
     subtotal/IVA/total, folios `COT-YYYYMM-…`, `tipo_cambio` requerido cuando
     `moneda == "USD"`, versionado de re-cotizaciones. Contraparte backend de
     `calc.ts` (`_convert_cost_to_quote_currency`, `_resolve_directional_tcs`):
     idealmente tests espejo con los mismos números que `calc.test.ts` para
     garantizar paridad front/back.
  2. FIFO de cuentas por cobrar — aplicación de pagos (`TransaccionCliente`)
     contra las órdenes más antiguas primero, saldos parciales, sobrepagos.
  3. `app/services/stock_service.py::aplicar_movimiento` — todo movimiento de
     stock genera row en `movimientos_stock`, disponible = `stock_actual −
     reservas activas`, ciclo reserva → liberación/consumo al
     cancelar/convertir cotización.
- **Multi-tenancy:** cualquier test de endpoint debe verificar que la consulta
  filtra por `organization_id` (dos orgs sembradas, asegurar que no hay fuga
  cross-tenant).

[Vitest]: https://vitest.dev/
