# Backlog — estado al 5 de agosto de 2026

> **Fuente única de qué falta.** Consolida los pendientes que estaban repartidos en `bugs-funcionales.md`, `technical-debt.md`, `risk-register.md`, `testing.md`, `consistencia-visual.md`, `oportunidades-por-modulo.md` y el spec del golden path. Esos documentos siguen siendo la referencia de *detalle*; este es el que dice **en qué orden**.
>
> Orden = riesgo primero, luego lo que desbloquea a otros, luego valor por esfuerzo. Cada punto dice **por qué está donde está**.

---

## P0 · Exposición en producción

Seis endpoints no tienen ninguna dependencia de autenticación —ni en el decorador, ni en el router, ni al montarlo—. **Verificado contra producción sin credenciales**, no inferido del código:

| Endpoint | Qué expone | Verificado |
|---|---|---|
| `GET /api/compras/proveedores` | Padrón de proveedores: nombre, contacto, correo, saldo | **200** |
| `POST /api/compras/proveedores` | **Escritura**: crear proveedores | sin auth en el código |
| `GET /api/compras/` | Listado de órdenes de compra | **200** |
| `GET /api/compras/historial` | Historial de compras | **200** |
| `GET /api/compras/{id}/imprimir` | OC imprimible, **con costos** | **200** |
| `GET /api/clientes/{id}/pdf-estado-cuenta` | Estado de cuenta de un cliente | sin auth en el código |

**No es un fallo general de autenticación:** `GET /api/remisiones/` responde 401 y `POST /api/admin/drop-all-tables` responde 401. Son estos seis en concreto.

**Trabajo:** añadir la dependencia de rol que corresponda a cada uno, alineada con el resto del módulo (compras exige admin o gerencia en sus otros 11 endpoints). Antes de aplicarlo hay que confirmar que ningún consumidor externo dependa hoy de la lectura abierta —el `imprimir` huele a enlace compartible—; si lo hay, la salida es un token de documento, no dejar el endpoint abierto.

**Va solo, en un commit quirúrgico**, sin mezclar con UI.

---

## P1 · Bloqueado por decisión ajena

Nada de esto avanza sin respuesta. Conviene preguntarlo ya porque **P2 depende de ello**.

| # | Pregunta | Para | Bloquea |
|---|---|---|---|
| 1 | ¿Una venta puede facturarse en parcialidades? | Vania | Modelo de datos de la Ola 3. Si sí, `facturas` es tabla propia 1:N; si no, bastan campos en la orden |
| 2 | ¿"Autorizado" es un usuario del sistema, texto libre, o ambos? | Vania / Axel | Ola 2 (E3) |
| 3 | ¿La remisión debe imprimir importes: siempre, nunca, o según el caso? | Vania / Axel | Ola 2 (E3). Hoy es un toggle |
| 4 | ¿Longitud del consecutivo de folio y reinicio mensual? Hoy 4 dígitos, mensual | Axel | Confirmación, no cambio |
| 5 | Tras un refetch del cotizador, ¿gana el servidor o lo que el usuario está escribiendo? | Emmanuel | La mitad abierta del bug #7 |
| 6 | Módulo `compras`: ¿se abre a Ventas y Operativo, o se cierra en la matriz? | Emmanuel | `permissions.py` lo declara visible para ambos mientras sus 11 endpoints exigen admin o gerencia. La matriz se contradice |
| 7 | ¿Qué significan las 61 cotizaciones canceladas (32 %)? | Vania | Priorización futura |

**Paso manual pendiente (30 segundos, Emmanuel):** en Railway → environment `staging` → servicio → Settings → Source, cambiar la rama de `main` a `staging`. La rama ya existe y está subida. Hasta entonces staging es un espejo de producción, no una compuerta previa. La API rechaza ese cambio desde fuera del panel.

---

## P2 · Golden path — olas 2 a 4 del spec

Detalle en `docs/superpowers/specs/2026-08-05-golden-path-remisiones-facturacion-design.md`.

**Ola 2 · E3 — documento oficial.** *Bloqueada por las decisiones 2 y 3.*
Columnas nuevas en `remisiones` (`autorizado_nombre`, `autorizado_usuario_id`, `documentos_relacionados`) con migración **y** entrada espejo en `_BACKFILL_DDL`. PDF con ATENTAMENTE, línea de firma, autorizado y relacionados condicionales, desde la misma fuente de datos que la vista previa.

**Ola 3 · E4 — facturación y pago.** *Bloqueada por la decisión 1.*
Facturado **se almacena** en la orden (referencia, fecha, quién registró). Pagado **se deriva** de CxC: no existe columna `pagado` que pueda contradecir al saldo. Así quedan separados por construcción.

**Ola 4 · E5/E6 — endurecer.**
- Ampliar auditoría más allá de cotizaciones y fusiones. **Hoy borrar un cliente, cambiar un precio o ajustar stock no dejan rastro** — el mayor hueco de gobernanza del sistema.
- Retirar el editor legacy demostrando que ninguna ruta activa lo alcanza.
- Quitar la carga completa de catálogo del KPI legacy.
- Suite E2E del golden path.

---

## P3 · Bugs restantes

El top 15 de la auditoría está cerrado salvo media entrada. Lo que queda vive en las secciones no priorizadas de `bugs-funcionales.md`:

**Manejo de errores** — el grupo más valioso por esfuerzo.
- `Layout.tsx:35-40`: **cualquier** fallo de `/api/auth/me` (500, timeout, parpadeo de red) expulsa al login, no solo el 401 → se pierde el trabajo en curso. Es el peor de la lista.
- `ReportesPage.tsx:292-294`: `window.location.href` **durante el render**, y hacia `/` en vez de `/spa/login`.
- Sin `onError` ni feedback: eliminar contacto, borrar nota (tampoco confirma), eliminar activo y planta — el 409 "la planta tiene activos" se pierde en silencio.
- **30 páginas sin manejo de error alguno**: una consulta caída se ve idéntica a "sin datos", indefinidamente. Requiere una primitiva `<QueryError onRetry>`.

**Estado obsoleto** — mitad abierta del #7 (decisión 5), efectos con `[]` que no reaccionan al cambio de query param (`CotizadorPage`, `RemisionesPage`), e import de JSON que sigue agregando líneas tras navegar fuera.

**Validación cliente vs servidor** — `GastoFormModal` no limita la categoría a 80 caracteres (el backend sí) → 422 crudo de Pydantic. `AjusteStockModal` menciona un rol equivocado en su mensaje de 403.

**Navegación** — `DealCard` enlaza a `/spa/seguimiento?orden=<id>` y esa página nunca lee query params; `TotalsBar` usa una ruta legacy cuyo redirect descarta el query string y recarga toda la SPA.

**Invalidaciones restantes** — los tres flujos de `SeguimientoPage` mueven stock y crean cargos sin invalidar `['productos']` ni `['cxc-*']`; los ajustes de inventario no invalidan `['cardex']`; las mutaciones de CRM no invalidan `['empresa',id,'deals']`. Y **cero invalidaciones de `['dashboard']` en toda la app**: sus alertas pueden estar arbitrariamente viejas.

> Barrido automático hecho: **ninguna** invalidación apunta ya a una clave inexistente (el caso `['compras']` era el único).

---

## P4 · Cobertura de pruebas

Ya hay CI con PostgreSQL real y 58 + 80 pruebas. Lo que falta, por valor:

1. **Concurrencia de cobranza** — dos sesiones aplicando pagos contra el mismo saldo. Es lo que resta del eje de concurrencia; sobre-entrega y folio ya están cubiertos. Va con dos conexiones (`pg_engine`) y `@pytest.mark.postgres`.
2. **Totales de venta en el backend** — espejo de `calc.test.ts` con los mismos números, para garantizar que servidor y cliente calculan idéntico.
3. **Cobranza FIFO** — pagos contra las órdenes más antiguas, saldos parciales, sobrepagos, aging.
4. **`stock_service.aplicar_movimiento`** — fila en `movimientos_stock`, disponible = `stock_actual − reservas`, ciclo reserva → liberación/consumo.
5. **Componentes React** — hoy ninguno; falta jsdom. Candidatos: carrito del cotizador y formularios con validación.

**Convención no negociable:** toda corrección con riesgo de regresión silenciosa se verifica **por mutación** — se rompe el arreglo y se comprueba que la prueba falla. Ya evitó tres falsos verdes (concurrencia, fechas, filas expandidas).

---

## P5 · Deuda estructural

| Deuda | Por qué importa | Tamaño |
|---|---|---|
| **Revisión base de Alembic** | La cadena no arranca desde vacío (53 revisiones). Atenuante: el despliegue tampoco corre Alembic, así que CI ya ejercita el camino real de producción. Ver `testing.md` | L, y una de las salidas toca producción |
| **Doble vía de esquema** | 84 `ADD COLUMN IF NOT EXISTS` en `seeds.py`. Toda columna nueva exige entrada doble; olvidarla es un 500 | L |
| **Routers gordos** | `ventas.py` 2 438 líneas mezcla dominio, persistencia y presentación. Patrón de salida ya probado en `app/domains/remisiones/` | L, incremental |
| **Sin lint/format** | No hay ESLint/Prettier/Ruff. La consistencia depende de disciplina, y ya hay CI donde engancharlo | S |
| **RBAC en dos mecanismos** | La matriz declarativa es el camino nuevo; el resto de routers sigue con helpers rol-string | M, incremental |
| **Branding backend** | "DASIC" inline en documentos de `compras.py` y `clientes.py` y en el título de la app. Bloquea la identidad neutra SaaS del lado servidor | S |
| **`useProveedores` ×4** | Cuatro definiciones con claves divergentes → cachés duplicados. Patrón correcto ya demostrado | S |
| **Decimales `number \| string`** | El backend serializa `Decimal` como string y los types lo modelan como unión. Contrato frágil en ordenamientos y sumas | M |

---

## P6 · Consistencia visual

Detalle y conteos en `consistencia-visual.md`. Los de mayor impacto por esfuerzo:

1. **`lib/status-tones.ts` no tiene ni un `dark:`** y usa tonos de rampa oscura → contraste ≈1.8:1 en tema claro, contra el mínimo 4.5:1 de WCAG. Afecta a 11 archivos. **Es un defecto de accesibilidad real, no cosmético.**
2. Corregir el mapa canónico de estados (`inactivo` es rose/danger cuando debería ser neutral) y borrar los 3 mapas locales.
3. `<QueryError onRetry>` y adoptarla en las 30 páginas sin manejo de error — se solapa con P3 y conviene hacerlo una sola vez.
4. `rounded` a secas → `rounded-md` en **164 sitios**: un radio que el sistema nunca definió.
5. Unificar el icono de editar (hay 4 glifos distintos) y el botón-acción-de-fila (6 formas, 26 con área táctil bajo el mínimo).

---

## P7 · Oportunidades de producto

Detalle en `oportunidades-por-modulo.md`. Doce quick wins de esfuerzo S, casi todos en un solo archivo. Los tres con mejor retorno:

1. **CxC** — cablear el modal de registrar pago en la fila de vencimiento: **el componente y su hook ya existen sin usarse**. Hoy quien cobra tiene que ir cliente por cliente.
2. **Export CSV** en gastos, inventario y aging — los módulos contables no tienen salida a Excel, y en inventario cierra el ciclo editar-y-resubir.
3. **Filtros en el Kanban del CRM** — es el único módulo sin ninguno.

> **Anotado en contra del plan:** producción tiene **473 productos fantasma contra 17 de catálogo**. El equipo cotiza mayoritariamente artículos que no existen en el sistema. Ninguna ola lo resuelve y probablemente sea el mayor retorno por hora de todo el backlog. Amerita un microciclo de carga o promoción masiva de catálogo con Vania y Axel.

---

## Anexo · Qué se cerró (para no re-abrirlo)

- **Ola 0 completa**: staging con aislamiento probado, CI con PostgreSQL 16, `conftest` dual, y **UAT-05 verificado por primera vez** (dos usuarios no consumen el mismo saldo), comprobado por mutación.
- **Ola 1**: los 15 bugs del top, salvo media entrada del #7. Invalidación de caché, permisos de UI contra la matriz del backend, stock al reabrir cotización, input de cantidad y fecha local.
- Tres hallazgos que **difirieron de lo auditado**: el bug de stock venía del backend; `listar_productos` excluía a `SUPERADMIN` de ver costos porque `RolUsuario.ADMIN` es un alias, no un tier; y el botón de ajustar stock no tenía gateo alguno (era falso positivo, no negativo).

Documentos que este backlog **deja obsoletos en su sección de estado**: `technical-debt.md` #1/#1b/#1c y `risk-register.md` R1/R2 seguían diciendo "no hay CI" y "cero cobertura".
