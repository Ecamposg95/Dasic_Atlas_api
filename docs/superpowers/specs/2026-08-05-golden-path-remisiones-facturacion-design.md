# Golden path: remisión → entrega → factura → CxC → pago

> Diseño aprobado 2026-08-05. Realineación del **Task Pack Maestro v2.0** (Emmanuel Campos) contra el estado verificado del repositorio y los datos de producción.
> Product Owners funcionales: Vania Higuera y Axel Montes de Oca · Producto Atlas: Emmanuel Campos.

## 1. Por qué este documento difiere del task pack

El task pack v2.0 es sólido como marco de gobernanza (invariantes, DoR/DoD, UAT, contrato de respuesta). Su fotografía del sistema, sin embargo, está desactualizada en tres puntos que cambian el alcance. Las correcciones fueron verificadas con evidencia en el repositorio y con consultas a la base de producción, y aprobadas por el propietario de producto.

### 1.1 Multi-tenancy: de invariante a preparación

El pack exige aislamiento por tenant en ~15 lugares. **El sistema es mono-tenant desde abril de 2026** (`migrations/versions/20260429_01_drop_multitenant.py`): no existen `Organization`, `Branch` ni `UserOrganization`; `organization_id` sobrevive como columna inerte en 3 archivos de modelo y `usuarios` no la tiene.

**Decisión aprobada — "terreno preparado":**
- Los invariantes de tenant se sustituyen por **owner-scoping por rol**, que existe hoy (`app/security/permissions.py` con variantes `:own` y `scope_query_by_owner`) y sí es verificable.
- **Regla permanente para todo trabajo nuevo:** cada tabla que se cree nace con `organization_id` (nullable, indexada) y cada consulta nueva se escribe de forma que scopearla después sea mecánico.
- La re-tenantización real es un proyecto aparte del roadmap SaaS, fuera de este alcance.

En la DoD, "tenant isolation verificado" se lee como **"owner-scoping y permisos verificados"**.

### 1.2 E1 y E2 ya están construidos

Verificado en el código: selección de partidas con casillas, vínculo por línea de origen sin mutar la cotización, buscador de cotización dentro del editor, acumulados de entrega con validación transaccional bajo lock al emitir, folio `R-YYMM####` server-side con advisory lock, editor híbrido con la interfaz del cotizador, y matriz de permisos con 8 acciones sobre remisión.

**El formato de folio del pack (`R-YYMM<consecutivo>`) coincide con el implementado.** Queda por confirmar con DASIC solo la longitud del consecutivo (hoy 4 dígitos) y si el reinicio mensual actual es el deseado.

Consecuencia: US-10 a US-14, US-20 y US-50 salen del alcance de *construcción* y entran a un microciclo de **verificación en staging**. Construirlas de nuevo violaría el propio invariante del pack de no duplicar capacidad existente.

### 1.3 La Definition of Done era inejecutable

Exigía staging (no existía), migraciones probadas sobre copia de producción (sin proceso) y pruebas de concurrencia — imposibles hoy porque la suite corre sobre **SQLite con `pg_advisory_xact_lock` y `hashtext` parcheados a no-op**: el invariante más crítico del pack (no sobreentregar bajo concurrencia) no se puede verificar en ese entorno.

**Decisión aprobada:** la Ola 0 crea staging y CI con PostgreSQL real *antes* de tocar el dominio de cantidades.

## 1.4 Estado de ejecución (actualizado 2026-08-05)

**Ola 0 — completa.**

- Environment `staging` en Railway con base propia. Aislamiento **probado, no asumido**: producción devuelve 192 cotizaciones contra 2 en staging. Queda un paso manual en el panel: apuntar el servicio a la rama `staging` (ya creada y subida) en vez de `main`, porque la API rechaza ese cambio desde fuera del panel. Mientras tanto sirve `railway up --environment staging`.
- CI en GitHub Actions (`.github/workflows/ci.yml`): `postgres:16` con healthcheck, la suite de backend y el `typecheck` + vitest + build del frontend, en cada push a `main` y en cada PR.
- `tests/conftest.py` en modo dual. Con `TEST_DATABASE_URL` corre sobre PostgreSQL real **sin parchear** `pg_advisory_xact_lock`/`hashtext`; sin ella conserva el modo SQLite para el desarrollo local. La suite pasa igual en ambos.
- **UAT-05 verificado por primera vez** (`tests/test_remisiones_concurrencia.py`): dos hilos, dos conexiones y una barrera que los cita justo antes del lock de orden. Comprobado por mutación que la prueba **falla** al quitar el lock — entrega 20 sobre una orden de 10. Segunda prueba: cuatro emisiones simultáneas sin repetir consecutivo de folio.

De las tres brechas del modo SQLite, **dos quedan cerradas** (locks reales y estrictez de PostgreSQL). La de migraciones queda parcial y se reevaluó a la baja: el despliegue tampoco corre Alembic, así que el camino de esquema que CI ejercita es el de producción (ver `docs/development/testing.md`).

**Ola 1 — el top 15 de la auditoría queda cerrado**, salvo media entrada. Se corrigieron los bugs #1 a #6 y #8 a #15, más el bonus. Por familias:

- **Invalidación de caché** (#1, #2, #3, #4, #5, #8, #9, #12). Los espejo #8 y #9 se corrigieron extrayendo `web/src/lib/cobranza-cache.ts`: el defecto era la enumeración duplicada de claves en dos módulos que no se conocen, y parcharla en ambos lados lo habría reproducido en la siguiente pantalla que lea saldo.
- **Permisos** (#6, #10, #11 y los falsos negativos de inventario). El backend ya resolvía esto: `/api/auth/me` entrega flags `can_*` y `modulos_visibles`, y su docstring dice que existen para que el frontend esconda UI. Nadie los consumía. Se añadieron `useCan()` y `useModuloVisible()` con las capacidades tipadas.
- **Datos y captura** (#13 stock al reabrir, #14 input de cantidad, #15 fecha local).

**Tres hallazgos que difieren de lo auditado**, todos verificados en el código:

1. El bug del stock (#13) no estaba en el store: `/detalle-json` no exponía `stock_actual`, así que el frontend no tenía de dónde leerlo.
2. `listar_productos` excluía a **SUPERADMIN** de ver costos, porque `RolUsuario.ADMIN` es un *alias* de `ADMINISTRADOR` y no un tier que lo incluya. Un superadmin caía al esquema de vendedor teniendo más permisos que un administrador.
3. El botón de ajustar stock **no tenía gateo alguno**: ventas y operativo lo veían y recibían 403 tras capturar el ajuste. La auditoría lo había clasificado como falso negativo; era falso positivo.

**Lo que queda abierto y por qué.** La otra mitad del #7: un refetch que aterrice mientras el usuario teclea sigue pisando la edición en vuelo. Arreglarlo exige marcar el estado como sucio y decidir **qué gana, el servidor o lo que se está escribiendo** — decisión de producto, sobre la pantalla más crítica del sistema. Y la contradicción de la propia matriz: `permissions.py` declara el módulo `compras` visible para Ventas y Operativo mientras sus 11 endpoints exigen admin o gerencia. O se alinea la matriz o se alinean los endpoints.

**Cobertura de pruebas.** 58 tests de vitest (antes 35) y 80 de pytest. Las tres correcciones con riesgo de regresión silenciosa —concurrencia, fechas y filas expandidas— se verificaron **por mutación**: se rompió el arreglo y se comprobó que la prueba falla. Sin eso una prueba verde no dice nada. La suite fija `TZ=America/Mexico_City` justamente por eso: en UTC, donde corre CI, el bug de fechas y su corrección devuelven lo mismo.

## 2. Alcance

### Dentro

| Ola | Contenido |
|---|---|
| **0 · Habilitador** | Staging en Railway · CI con PostgreSQL · `conftest` en modo dual (Postgres cuando hay `TEST_DATABASE_URL`, SQLite como respaldo local) · pruebas de concurrencia reales |
| **1 · Estabilizar** | Bugs verificados que viven dentro del golden path: invalidación de caché en remisiones, permisos de UI alineados con la matriz del backend, stock al reabrir cotización, y el resto del top de correcciones de `docs/current-state/bugs-funcionales.md` |
| **2 · E3** | Autorizado y firma · documentos relacionados · PDF completo (ATENTAMENTE, firma, autorizado, relacionados condicionales) |
| **3 · E4** | Facturación y pago con CxC como fuente de verdad del saldo |
| **4 · E5/E6** | Auditoría ampliada · observabilidad · retiro de legacy · KPI sin carga de catálogo · suite E2E del golden path |

### Fuera (explícito)

Timbrado CFDI y emisión de complementos · carga de archivos y adjuntos · re-tenantización de la base · reconstrucción de E1/E2 · roadmaps por semanas.

### Anotado en contra del pack

Los datos de producción muestran **473 productos "fantasma" contra 17 productos de catálogo**: el equipo cotiza mayoritariamente artículos que no existen en el sistema. Ninguna ola de este plan lo resuelve y probablemente sea el mayor retorno por hora del backlog. Se recomienda un microciclo paralelo de carga o promoción masiva de catálogo, con Vania y Axel.

## 3. Diseño por ola

### Ola 0 — Habilitador

**Staging.** Environment nuevo en el proyecto de Railway, con su propia base de datos y variables. Se despliega desde la misma rama para reproducir el comportamiento de producción, incluido el arranque con `create_all` + backfill + seeds.

**CI.** Workflow que levanta un contenedor `postgres:16`, aplica `alembic upgrade head` sobre una base efímera y corre la suite, más `typecheck` y `build` del frontend. Cierra las tres brechas que documenta `docs/development/testing.md`: locks reales, migraciones ejecutadas y estrictez de PostgreSQL — esta última ya dejó pasar un error a producción (`f501338`, el `GROUP BY` que tumbó el módulo de gastos).

**`conftest` dual.** Si existe `TEST_DATABASE_URL` se usa PostgreSQL con migraciones reales y sin shims; si no, se conserva el modo SQLite actual para que el desarrollo local sin base de datos siga funcionando. Los tests que dependen de comportamiento exclusivo de PostgreSQL se marcan para omitirse fuera de ese modo.

**Pruebas de concurrencia.** Dos sesiones simultáneas intentando consumir el mismo saldo pendiente: exactamente una confirma, la otra recibe conflicto recuperable. Es UAT-05 y el invariante central del pack, verificable por primera vez.

### Ola 1 — Estabilizar el golden path

Prioridad sobre construir: el bug crítico #1 de la auditoría está **dentro** del flujo que el pack quiere cerrar. Las mutaciones de remisión no invalidan el borrador ni el avance de entrega, así que el editor precarga pendientes anteriores a la emisión y el usuario intenta entregar de más. Construir E3/E4 encima sin corregirlo amplifica el problema.

Incluye también el alineamiento de permisos de UI (el menú y las acciones de remisión ofrecen operaciones que el backend rechaza con 403) — que es, además, el equivalente ejecutable del invariante de aislamiento que el pack pedía.

### Ola 2 — E3: documento oficial

**Modelo** (columnas nuevas en `remisiones`, con migración y entrada espejo en `_BACKFILL_DDL`):
- `autorizado_nombre` — snapshot histórico del nombre impreso; se persiste al emitir y no cambia después.
- `autorizado_usuario_id` — opcional, cuando el autorizado es un usuario del sistema.
- `documentos_relacionados` — texto multilínea sanitizado.

**PDF/Word.** Fuente de datos única con la vista previa. Añade "ATENTAMENTE", línea de firma, nombre del autorizado y la sección de documentos relacionados **solo cuando existe**. Se conservan la marca de agua de borrador y el sello de cancelada ya implementados.

### Ola 3 — E4: facturación y pago

**Principio de diseño:** el pack teme —con razón— que los estados de facturación y pago se desincronicen de CxC. La forma de eliminar ese riesgo no es sincronizar, es **no duplicar el dato**.

- **Facturado se almacena** en la orden: referencia de factura, fecha, usuario que la registró. Es información que CxC no tiene.
- **Pagado se deriva** del saldo de CxC (`TransaccionCliente`, que ya aplica pagos FIFO). No existe una columna `pagado` que pueda contradecir al saldo: el estado se calcula.
- Facturado y pagado quedan así separados por construcción, como exige el invariante.

**Decisión requerida antes de implementar:** si una venta puede facturarse en parcialidades, `facturas` debe ser tabla propia (1:N con la orden); si siempre es una factura por venta, bastan campos en la orden. El diseño se cierra con la respuesta de Vania.

### Ola 4 — Endurecer

Ampliar la auditoría más allá de cotizaciones y fusiones (hoy borrar un cliente, cambiar un precio o ajustar stock no dejan rastro: es el mayor hueco de gobernanza del sistema) · retirar el editor legacy demostrando que ninguna ruta lo alcanza · eliminar la carga completa de catálogo del KPI legacy · suite E2E del golden path.

## 4. Invariantes vigentes

Se conservan los del task pack, con la sustitución del punto de tenancy:

1. **Owner-scoping y permisos aplicados en el backend**; el frontend no decide autorización (sí puede ocultar lo que el backend rechazaría).
2. La cotización de origen no se altera al editar o eliminar líneas de una remisión.
3. La remisión conserva vínculo con la cotización y con cada línea de origen.
4. El folio se genera del lado del servidor y es único.
5. Las cantidades remitidas y pendientes nunca quedan negativas ni superan lo autorizado sin autorización explícita y auditada.
6. Creación, emisión, cancelación y reversión son transaccionales.
7. Dos usuarios no consumen simultáneamente el mismo saldo (verificable desde la Ola 0).
8. Los movimientos de stock pasan por el servicio de dominio; nunca se escribe directo a la tabla.
9. **Facturado y pagado son estados distintos**, y pagado se deriva de CxC.
10. Referencias documentales sin timbrado CFDI.
11. Cambios de precio, costo, utilidad, descuento, moneda o impuestos requieren permiso, justificación y auditoría.
12. Migraciones no destructivas, con entrada espejo en `_BACKFILL_DDL` y rollback documentado.
13. No se elimina legacy sin demostrar que ninguna ruta activa depende de él.
14. No se duplica capacidad existente ni se inventan reglas de negocio.
15. **Toda tabla nueva nace con `organization_id`** (preparación SaaS).

## 5. Definition of Done (ejecutable)

Una historia está terminada cuando: los criterios se demuestran **en staging**; pasan las suites aplicables **incluida la de PostgreSQL en CI**; pasan lint, typecheck y build; las migraciones se probaron sobre staging con datos representativos; **owner-scoping y permisos verificados**; auditoría incluida donde la regla lo exige; rollback documentado; sin defectos críticos abiertos; evidencia de QA; UAT aprobada por Vania o Axel; y documentación actualizada.

## 6. Decisiones requeridas (no bloquean las olas 0 y 1)

| # | Pregunta | Bloquea |
|---|---|---|
| 1 | ¿Una venta puede facturarse en parcialidades? | Modelo de la Ola 3 |
| 2 | ¿"Autorizado" es un usuario del sistema, un nombre libre, o ambos? | Ola 2 |
| 3 | ¿La remisión debe imprimir importes, nunca o según el caso? | Ola 2 (hoy es un toggle) |
| 4 | ¿Longitud del consecutivo de folio y reinicio? Hoy: 4 dígitos, mensual | Confirmación, no cambio |
| 5 | ¿Qué significan las 61 cotizaciones canceladas (32 %)? | Priorización futura |

## 7. Riesgos

| Riesgo | Control |
|---|---|
| Construir sobre el bug de caché del golden path | La Ola 1 va antes que E3/E4, por diseño |
| Migrar el `conftest` rompe la suite existente | Modo dual: PostgreSQL en CI, SQLite como respaldo; se comparan resultados antes de cambiar el default |
| Staging diverge de producción y da falsos verdes | Mismo código, mismo arranque, misma cadena de migraciones; se documenta lo que sí difiere (datos y variables de integración) |
| El equipo sigue capturando fantasmas | Fuera del alcance; se eleva como microciclo paralelo recomendado |
| Ninguna ola aumenta la adopción de módulos en cero | Se mide adopción semanal como métrica de soporte; los módulos sin uso no reciben inversión hasta tener señal |
