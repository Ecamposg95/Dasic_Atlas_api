# Registro de riesgos

> Auditoría Task Pack 00 · 2026-08-03. Sistema **en producción con autodeploy desde `main`** — ese es el contexto de todo riesgo.

## Críticos

| ID | Riesgo | Mitigación |
|---|---|---|
| R1 | **Todo push a `main` despliega a producción sin tests.** Una regresión visual/funcional del rediseño llega directo a DASIC. | Commits pequeños; validar `typecheck`+`build`+`compileall` antes de cada push; considerar branch de trabajo + preview de Railway para los cambios de shell; smoke manual post-deploy. |
| R2 | **Cero cobertura de tests** sobre lógica de dinero (totales, FIFO de pagos, stock). Refactors de routers gordos sin red. | No refactorizar backend en la etapa visual; si se toca lógica de negocio, montar harness pytest primero (Task Pack 15). |
| R3 | **Esquema de DB con doble vía** (Alembic + `_BACKFILL_DDL` + `create_all`); Railway no corre Alembic. Columna nueva sin backfill → 500 en todos los endpoints que carguen la fila. | Regla vigente: toda columna en tabla existente = migración + entrada `_BACKFILL_DDL` + re-export. No introducir cambios de esquema en la fase visual salvo indispensables. |

## Importantes

| ID | Riesgo | Mitigación |
|---|---|---|
| R4 | Endpoints con autorización inconsistente (~9 sin dependencia de rol; `POST /api/inventario/movimientos` el más sensible). | Revisión puntual y cierre en un commit de seguridad quirúrgico (no mezclado con UI). |
| R5 | `SECRET_KEY` puede rotar entre deploys (si no está fijada en Railway) → sesiones invalidadas en cada release del rediseño. | Verificar/fijar variable en Railway antes de la cadena de releases visuales. |
| R6 | Migración masiva slate→tokens puede romper contraste/light-mode en páginas no revisadas. | Migrar por feature (commit por página), QA visual light+dark por página; guardrail del prompt: no reemplazar todos los estilos en un cambio masivo. |
| R7 | Documentación contradictoria (`context/` legacy: Next.js/Prisma hipotético, Jinja retirado, multi-tenant que ya no existe) puede inducir a agentes/devs a decisiones erróneas. | `docs/current-state/` (este paquete) como fuente única del estado; marcar/archivar legacy en Task Pack 17. |
| R8 | SaaS: la expectativa "DASIC como primer tenant" choca con la realidad mono-tenant (multi-tenancy retirada en `20260429_01`). Re-tenantizar la DB es proyecto mayor. | Etapa actual: tenant-config/branding/feature-flags **frontend + config runtime** (Task Pack 14 ligero); multi-tenancy real documentada como roadmap, no ejecutada ahora. |

## Deseables de vigilar

| ID | Riesgo | Nota |
|---|---|---|
| R9 | Modales grandes (OC/Producto) al migrarse a drawer/página pueden alterar flujos memorizados por usuarios. | Cambios opt-in, comunicar en demo. |
| R10 | Bundle: agregar librerías de UI pesadas (calendarios, gantt) contradice el presupuesto actual (~200 kB vendor-react). | Medir antes; preferir composición con primitivas propias. |
| R11 | `hello` y templates Jinja muertos generan superficie de confusión. | Retiro programado (Fase 5), no urgente. |

## Ambigüedades / dependencias externas

- No hay entorno de staging conocido: validar si Railway tiene environments/preview antes de la primera entrega visual.
- No hay acceso a screenshots/baseline visual desde este entorno (WSL headless) — pendiente Task Pack 01 con dev server.
- Falta confirmación del usuario sobre: nombre público del producto en UI neutra ("Atlas Industrial Services" vs "Atlas ONE"), y si la consola superadmin entra en el rediseño (hoy 0% tokens).
