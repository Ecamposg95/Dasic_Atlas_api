# Mapa de consumo de APIs

> Auditoría Task Pack 00 · 2026-08-03. 24 routers, ~190 endpoints bajo `/api/*`. Autorización por dependencia FastAPI (`app/security/jwt.py`).

## Resumen por router

| Router | Prefix | Endpoints | Autorización dominante | Consumido por (feature SPA) |
|---|---|---|---|---|
| auth | `/api/auth` | login, me, logout | pública / `get_current_user` | `auth`, `Layout`, `Header` |
| ventas | `/api/ventas` | 25 (CRUD cotización, recotizar, versiones, convertir, PDF/Word, correo, whatsapp-log, IA, plantillas, sugerir/generar OC, defaults) | `allow_all_staff` | `cotizador`, `borradores`, `seguimiento` |
| clientes | `/api/clientes` | 28 (CRUD, dedup/merge, notas, deals, estado de cuenta, pagos, contactos anidados, órdenes) | `allow_all_staff` / mutaciones sensibles `allow_admin_asistente` | `clientes`, `cxc`, `contactos` |
| contactos | `/api/contactos` | listar, historial | `allow_all_staff` | `contactos` |
| crm | `/api/crm` | pipelines, board, deals CRUD/move | `allow_all_staff` | `crm` |
| compras | `/api/compras` | 17 (proveedores, historial, borrador/confirmar OC desde cotización, recibir total/parcial, pagos, editor OC) | `allow_admin_asistente` | `compras`, `cotizador` (PreviewOCDrawer) |
| productos | `/api/productos` | 12 (CRUD, ajustar stock, CSV import/export, QR, kardex) | mixta | `inventario`, `cotizador` |
| inventario | `/api/inventario` | movimientos, disponibilidad, liberar reservas | `allow_all_staff` | `inventario` |
| servicios | `/api/servicios` | 9 (CRUD, buscar, historial uso) | mixta | `servicios`, `cotizador` |
| precios | `/api/precios` | CRUD + comparar | `allow_all_staff` | `precios` |
| catalogos | `/api/catalogos` | 13 (marcas CRUD, categorías, unidades, sugerir SKU) | lectura staff / mutación admin_asistente | `catalogos`, `inventario` |
| sat | `/api/sat` | 14 catálogos SAT | `allow_all_staff` | `catalogos`, `inventario` (sat-combobox) |
| fantasmas | `/api/fantasmas` | 6 (listar, detalle, promover, descartar) | staff / promover admin | `fantasmas` |
| remisiones | `/api/remisiones` | 7 (borrador desde orden, CRUD, recepción, Word, imprimir) | `allow_all_staff` | `remisiones` |
| reportes_servicio_docs | `/api/reportes-servicio-docs` | 5 | `allow_all_staff` | `reportes_servicio_docs` |
| gastos | `/api/gastos` | 5 | `allow_admin_asistente` | `gastos` |
| cuentas_por_cobrar | `/api/cuentas-por-cobrar` | resumen, vencimientos, aging, top-deudores, marcar-vencidos | `allow_all_staff` | `cxc`, `dashboard` |
| fx | `/api/fx` | usd-mxn, refresh, override, histórico | staff / override admin | `fx`, `cotizador` |
| dashboard | `/api/dashboard` | hero, pipeline, tendencia, alertas, tops, heatmap, kpis | `allow_all_staff` | `dashboard` |
| reportes | `/api/reportes` | 10 (ventas-mes, tops, conversión, ranking, CSV) | staff / ranking admin_asistente | `analitica` (`reportes`, `reportes_servicio`) |
| recordatorios | `/api/recordatorios` | 6 (CRUD, resumen, completar, posponer) | `allow_all_staff` (router-level) | `recordatorios`, `dashboard` |
| usuarios | `/api/usuarios` | 5 (CRUD + reset password) | `allow_user_admin` | `usuarios` |
| superadmin | `/api/superadmin` | config, audit, health, maintenance | `allow_superadmin` | `superadmin` |
| admin | `/api/admin` | seed-context, drop-all-tables | `allow_superadmin` | `superadmin` (Mantenimiento) |

## Hallazgos de autorización (para risk-register)

Endpoints **sin dependencia de rol declarada** (autenticación implícita vía cookie pero sin check de rol explícito en firma):

- `compras.py`: `GET /proveedores`, `POST /proveedores`, `GET /`, `GET /historial`, `GET /{id}/imprimir`
- `productos.py`: `GET /`, `GET /{id}`
- `clientes.py`: `GET /{cliente_id}/pdf-estado-cuenta`
- `inventario.py`: `POST /movimientos` (crear ajuste manual) ← **el más sensible**

Requiere verificación caso por caso (algunos validan dentro del handler), pero el patrón inconsistente es deuda de seguridad.

## Contratos

- Types TS curados a mano por feature (`features/<x>/types.ts`); existe script `types:gen` (openapi-typescript) pero `web/src/types/` no existe — no se usa generación.
- Decimales viajan como **string** desde Pydantic; los types TS declaran `number` (funciona por coerción JS — deuda de contrato).
- Errores 422 de Pydantic v2 llegan como array de objetos → helper `normalizeDetail` en el front.
