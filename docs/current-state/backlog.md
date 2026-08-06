# Backlog — estado al 6 de agosto de 2026

> **Fuente única de qué falta.** Consolida los pendientes repartidos en `bugs-funcionales.md`, `technical-debt.md`, `risk-register.md`, `testing.md`, `consistencia-visual.md`, `oportunidades-por-modulo.md` y el spec del golden path. Esos documentos siguen siendo la referencia de *detalle*; este dice **en qué orden**.
>
> Cada estado de aquí está **verificado contra el código o contra producción**, no recordado. Cuando un conteo aparece, se midió.

---

## P0 · Bloqueado por decisión ajena

Nada de esto avanza sin respuesta, y **P1 depende de las tres primeras**.

| # | Pregunta | Para | Bloquea |
|---|---|---|---|
| 1 | ¿Una venta puede facturarse en parcialidades? | Vania | Modelo de datos de la Ola 3. Si sí, `facturas` es tabla propia 1:N; si no, bastan campos en la orden |
| 2 | ¿"Autorizado" es un usuario del sistema, texto libre, o ambos? | Vania / Axel | Ola 2 (E3) |
| 3 | ¿La remisión imprime importes: siempre, nunca, o según el caso? | Vania / Axel | Ola 2 (E3). Hoy es un toggle |
| 4 | ¿Longitud del consecutivo de folio y reinicio mensual? Hoy 4 dígitos, mensual | Axel | Confirmación, no cambio |
| 5 | Tras un refetch del cotizador, ¿gana el servidor o lo que el usuario escribe? | Emmanuel | La mitad abierta del bug #7 |
| 6 | Módulo `compras`: ¿se abre a Ventas y Operativo, o se cierra en la matriz? | Emmanuel | `permissions.py` lo declara visible para ambos mientras sus 11 endpoints exigen admin o gerencia. **La matriz se contradice a sí misma** |
| 7 | En el orden de cobro, ¿un cargo **sin** fecha de vencimiento debe cobrarse antes que uno vencido? | Administración | Hoy sí (`nullsfirst`). Puede ser deliberado o efecto colateral; el comportamiento está fijado en una prueba |
| 8 | ¿Qué día se capturó realmente **C-2608009**? | Emmanuel | Si fue la tarde del 5, su fecha guardada (6 de agosto) está corrida por el bug del cotizador que se corrigió esa mañana. Determina si hay documentos que corregir |

### Operativos, no de producto

- **GitHub Actions dejó de crear runs** el 6 de agosto a las 17:51 UTC. Los commits posteriores están en el remoto, el workflow figura `active` y el YAML es válido, pero no se dispara ninguna ejecución. El repositorio no está archivado ni deshabilitado → apunta a un límite o restricción de Actions en la cuenta. **Mientras tanto, CI no valida nada.**
- **Staging apunta a `main`**, así que hoy es un espejo y no una compuerta previa. La rama `staging` existe y está subida; falta cambiarla en el panel de Railway (la API rechaza ese cambio desde fuera). 30 segundos.

---

## P1 · Golden path — olas 2 a 4

Detalle en `docs/superpowers/specs/2026-08-05-golden-path-remisiones-facturacion-design.md`. **Las olas 0 y 1 están cerradas** (ver anexo).

**Ola 2 · E3 — documento oficial.** *Bloqueada por las decisiones 2 y 3.*
Columnas nuevas en `remisiones` (`autorizado_nombre`, `autorizado_usuario_id`, `documentos_relacionados`) con migración **y** espejo en `_BACKFILL_DDL`. PDF con ATENTAMENTE, línea de firma, autorizado y relacionados condicionales, desde la misma fuente que la vista previa.

**Ola 3 · E4 — facturación y pago.** *Bloqueada por la decisión 1.*
Facturado **se almacena** en la orden; pagado **se deriva** de CxC. Sin columna `pagado` que pueda contradecir al saldo.

**Ola 4 · E5/E6 — endurecer.** *No bloqueada.*
- Ampliar la auditoría más allá de cotizaciones y fusiones. **Hoy borrar un cliente, cambiar un precio o ajustar stock no dejan rastro** — el mayor hueco de gobernanza del sistema.
- Retirar el editor legacy demostrando que ninguna ruta activa lo alcanza.
- Quitar la carga completa de catálogo del KPI legacy.
- Suite E2E del golden path.

---

## P2 · Lo que quedó a medias

Trabajo empezado y no terminado. Va antes que lo nuevo: media adopción es peor que ninguna, porque nadie sabe qué esperar.

- **Estado de error por página.** Medido: **18 con la primitiva `QueryError`, 5 con banner propio sin unificar, 12 sin nada**. De esas 12, dos no aplican —`LoginPage` es un formulario con su propio error y `CrearRemisionPage` es código muerto sin ruta—, así que quedan **10 reales**: KPIs, catálogos, detalle de empresa, cotizador, dashboard, FX, editor de remisión, reportes de servicio, mantenimiento y consola de superadmin. El patrón está probado en tres formas (fila de tabla, bloque suelto y banner de página cuando hay varias consultas); lo que falta es mecánico.
- **Bug #7, mitad abierta.** Guardar ya no cierra los paneles de detalle, pero un refetch que aterrice mientras se teclea sigue pisando la edición. Depende de la decisión 5.
- **`B904` diferido en ruff** (67 casos): `raise ... from exc` dentro de un `except` conserva la causa en el traceback. Arreglarlo hoy habría tapado los cambios funcionales que lo acompañaban. Va en su propio commit.

---

## P3 · Deuda estructural

| Deuda | Estado verificado | Tamaño |
|---|---|---|
| **Routers gordos** | `ventas.py` **2 457 líneas**, `compras.py` 1 191, `clientes.py` 1 162, `productos.py` 951. Patrón de salida probado en `app/domains/remisiones/`. **Ya tiene red**: totales, redondeo, fechas, stock y cobranza están cubiertos por pruebas | L, incremental |
| **Doble vía de esquema** | **84** `ADD COLUMN IF NOT EXISTS` en `seeds.py`. Railway no corre Alembic, así que toda columna nueva exige entrada doble; olvidarla es un 500 | L |
| **Revisión base de Alembic** | La cadena no arranca desde vacío (53 revisiones + la de hoy). Atenuante: el despliegue tampoco corre Alembic, así que CI ya ejercita el camino real de producción. Ver `testing.md` | L, y una salida toca producción |
| **RBAC en dos mecanismos** | La matriz declarativa es el camino nuevo y ya la usan remisiones y la UI; el resto de routers sigue con helpers rol-string | M, incremental |
| **Branding en el backend** | **22** ocurrencias de "DASIC" en documentos de `compras.py`/`clientes.py` y en el título de la app. Bloquea la identidad neutra SaaS del lado servidor | S |
| **`useProveedores` ×4** | Cuatro definiciones (`compras`, `cotizador`, `fantasmas`, `inventario`) con claves divergentes → cachés duplicados. Es la misma clase de bug que se corrigió en cobranza extrayendo un helper | S |
| **Decimales `number \| string`** | El backend serializa `Decimal` como string y los types lo modelan como unión. Contrato frágil en ordenamientos y sumas | M |
| **Tipos de fecha en el resto del modelo** | `ordenes_venta` ya usa `DATE`. Conviene revisar si otras tablas guardan fechas de calendario como timestamp — la misma trampa | S, auditoría |

---

## P4 · Consistencia visual

Detalle y conteos en `consistencia-visual.md`. El punto 1 (contraste de `status-tones`) **está cerrado**. Lo que queda, por impacto:

1. **Corregir el mapa canónico de estados** — `inactivo` es *danger* cuando un cliente inactivo no es un error; `borrador` y `descartado` igual. Es un juicio de producto sobre qué color merece cada estado, por eso se separó del arreglo de contraste.
2. **`rounded` a secas → `rounded-md`** en 164 sitios: un radio que el sistema nunca definió.
3. **Unificar el icono de editar** (4 glifos distintos) y el botón-acción-de-fila (6 formas, 26 con área táctil bajo el mínimo).
4. Densidad de tabla a `px-4 py-3` en los 7 listados que usan la otra escala.
5. Migrar los ~50 `"Cargando…"` a skeleton, empezando por el dashboard.

---

## P5 · Oportunidades de producto

Detalle en `oportunidades-por-modulo.md`. Doce quick wins de esfuerzo S. Las tres de mejor retorno:

1. **CxC** — cablear el modal de registrar pago en la fila de vencimiento: **el componente y su hook ya existen sin usarse**. Hoy quien cobra va cliente por cliente.
2. **Export CSV** en gastos, inventario y aging — los módulos contables no tienen salida a Excel, y en inventario cierra el ciclo editar-y-resubir.
3. **Filtros en el Kanban del CRM** — es el único módulo sin ninguno.

> **Anotado en contra del plan:** producción tiene **473 productos fantasma contra 17 de catálogo**. El equipo cotiza mayoritariamente artículos que no existen en el sistema. Ninguna ola lo resuelve y probablemente sea el mayor retorno por hora de todo el backlog. Amerita un microciclo de carga o promoción masiva con Vania y Axel.

---

## Anexo · Cerrado (para no re-abrirlo)

**Ola 0** — staging con aislamiento probado, CI con PostgreSQL 16, `conftest` dual y **UAT-05 verificado por primera vez**, comprobado por mutación.

**Ola 1** — los 15 bugs del top de la auditoría, salvo media entrada del #7.

**Seguridad** — seis endpoints respondían sin credenciales, uno de ellos de **escritura**. Cerrados y verificados con 401 en producción. El guardián es un barrido de todas las rutas montadas, no una prueba por endpoint.

**Cobertura de pruebas** — de ~75 a **156** en el backend (PostgreSQL) y de 35 a **123** en el frontend, con harness de componentes React. Encontraron **cuatro defectos de producción, todos silenciosos**: un pago que desaparecía del saldo con dos cobradores simultáneos, un importe guardado distinto del aprobado, el calendario adelantado medio día, y errores de formulario que ningún lector de pantalla anunciaba.

**Fechas** — corregido de raíz. `fecha_creacion` y `fecha_vencimiento` pasan de instante a `DATE`, con conversión que distingue los dos orígenes de los datos (139 filas escritas por el cotizador vs. 56 generadas por el backend). Verificado contra producción. Antes, el mismo documento mostraba dos fechas distintas según la pantalla.

**Lint e higiene** — ruff en CI con reglas de alta señal (encontró el 500 del login con "recordar sesión") y `.gitattributes` que normaliza finales de línea, después de que tres archivos cambiaran de formato en silencio dentro de commits ajenos.
