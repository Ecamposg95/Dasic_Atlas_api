# Documentación · Atlas ONE (dasic-atlas-api)

Índice maestro de toda la documentación del repo. Ordenado de **"empieza aquí"**
hacia **profundidad**: los primeros bloques te dejan operando; los últimos son
auditorías y specs históricos que se consultan por necesidad, no de corrido.

---

## 1. Empieza aquí (en este orden)

| # | Documento | Qué contiene | Cuándo leerlo |
|---|---|---|---|
| 1 | [`README.md`](../README.md) (raíz) | Qué es el producto, capacidades, arquitectura en una página, comandos mínimos | Primer contacto con el repo |
| 2 | [`CLAUDE.md`](../CLAUDE.md) (raíz) | **Reglas operativas para agentes de IA** y humanos: stack real, convenciones no negociables, estado transitorio | Antes de tocar cualquier línea de código |
| 3 | [`Atlas-ONE-Proyecto.md`](Atlas-ONE-Proyecto.md) | Panorama generoso del sistema: stack, bootstrap, modelos por dominio, design system, módulo por módulo, gotchas y roadmap | Para entender *el producto completo*, no solo el código |
| 4 | [`development/local-setup.md`](development/local-setup.md) | Puesta en marcha verificada: requisitos, variables de entorno completas, DB, primer arranque, seeds, credenciales, frontend, tests, troubleshooting | Al configurar tu máquina |
| 5 | [`development/coding-standards.md`](development/coding-standards.md) | Convenciones reales extraídas del código: backend, frontend, commits, build | Antes del primer PR |

---

## 2. Desarrollo (`docs/development/`)

| Documento | Qué contiene | Cuándo leerlo |
|---|---|---|
| [`local-setup.md`](development/local-setup.md) | Setup local end-to-end + tabla completa de env vars con default y propósito | Primera vez, y al depurar un arranque roto |
| [`coding-standards.md`](development/coding-standards.md) | Modelos por dominio y re-exports, patrón `app/domains/<x>/`, Alembic + `_BACKFILL_DDL`, permisos con `require()`, estructura `features/<x>/`, tokens semánticos, TanStack Query, commits | Al escribir código nuevo o revisar un PR |
| [`testing.md`](development/testing.md) | Harness de pruebas: vitest (frontend) y su cobertura del motor de cálculo | Al agregar pruebas. **Nota:** su sección "Estrategia pendiente: backend (pytest)" quedó desactualizada — el harness pytest ya existe en `tests/` (ver `local-setup.md` §7) |
| [`deployment.md`](development/deployment.md) | Cómo se despliega de verdad en Railway, por qué `dist/` va commiteado, Alembic fuera del deploy, verificación y rollback | Antes de tu primer push a `main` (que despliega a producción) |

---

## 3. Producto (`docs/product/`)

Documentos de diseño/negocio. **No son especificaciones implementadas** salvo
que digan lo contrario.

| Documento | Qué contiene | Cuándo leerlo |
|---|---|---|
| [`cpq-evolution.md`](product/cpq-evolution.md) | Evolución del cotizador hacia un CPQ industrial. Solo diseño: contratos TypeScript de referencia, sin implementación | Al planear features grandes del cotizador |
| [`cotizador-mobile-plan.md`](product/cotizador-mobile-plan.md) | Plan de usabilidad móvil del cotizador (deriva de `ux-audit-v2`) | Al trabajar responsive en el cotizador |
| [`remisiones-sprint-gap-analysis.md`](product/remisiones-sprint-gap-analysis.md) | Estado real de remisiones vs el spec de Scrum, post-merge de `feat/remisiones-v2` | Antes de refinar remisiones con el PO |

---

## 4. Estado actual y auditorías (`docs/current-state/`)

Fotografía del repo hecha en la auditoría de agosto 2026. Útil para ubicarte
rápido; **envejece con el código**, así que verifica contra el código antes de
apoyar una decisión en estos documentos.

| Documento | Qué contiene | Cuándo leerlo |
|---|---|---|
| [`repository-overview.md`](current-state/repository-overview.md) | Qué es el repo, fuentes canónicas, estructura | Onboarding rápido |
| [`architecture-current.md`](current-state/architecture-current.md) | Arquitectura backend/frontend tal como está | Antes de un refactor estructural |
| [`module-inventory.md`](current-state/module-inventory.md) | Módulos en producción ↔ módulos objetivo del producto SaaS | Al planear roadmap |
| [`route-inventory.md`](current-state/route-inventory.md) | Todas las rutas de la SPA (`router.tsx`) | Al agregar o mover una página |
| [`api-consumption-map.md`](current-state/api-consumption-map.md) | Routers y endpoints `/api/*` con su autorización | Al buscar dónde vive un endpoint |
| [`ui-component-inventory.md`](current-state/ui-component-inventory.md) | Primitivas de `components/ui/` y su uso | Antes de crear un componente nuevo (probablemente ya existe) |
| [`ux-audit-v2.md`](current-state/ux-audit-v2.md) | Auditoría UI/UX vigente: adopción de tokens, accesibilidad, responsive | Al trabajar en UI |
| [`ux-audit.md`](current-state/ux-audit.md) | Auditoría UX previa — **sustituida** por `ux-audit-v2.md` | Solo como historial |
| [`technical-debt.md`](current-state/technical-debt.md) | Deuda técnica clasificada por severidad | Al elegir en qué invertir tiempo |
| [`risk-register.md`](current-state/risk-register.md) | Riesgos del sistema en producción con autodeploy | Antes de cambios sensibles |
| [`modernization-opportunities.md`](current-state/modernization-opportunities.md) | Quick wins y apuestas de modernización priorizadas | Al planear un sprint |

---

## 5. Specs y planes (`docs/superpowers/`)

Historial de diseño e implementación por feature. Cada feature relevante tiene
un **spec** (`specs/AAAAMMDD-<feature>-design.md`) con el diseño acordado y a
veces un **plan** (`plans/…`) con la ejecución por fases.

- **Cuándo leerlos:** cuando vas a modificar una feature existente y necesitas
  el *porqué* de una decisión (p. ej. remisiones v2, TC direccional, dedup de
  empresas, login moderno).
- **Cuándo NO:** no son documentación de estado. Un spec describe lo que se
  planeó ese día; el código pudo evolucionar después.
- Ejemplos vigentes: `specs/2026-08-03-remisiones-v2-design.md`,
  `specs/2026-08-04-remision-editor-hibrido-design.md`,
  `specs/2026-06-12-c1-contactos-dedup-design.md`.

> **Detalle de git:** `docs/superpowers/` está listado en `.gitignore`, pero los
> ~45 archivos que ya estaban versionados siguen trackeados. Los archivos
> *nuevos* de esa carpeta no se agregan solos: si quieres versionar un spec
> nuevo, hay que forzarlo (`git add -f`).

---

## 6. `context/` — parcialmente legacy ⚠️

`context/` fue la documentación original del proyecto y **describe estados
anteriores del sistema**:

- `context/CLAUDE.md` describe un stack **Next.js/Prisma que nunca se
  implementó**.
- `context/UI_PATTERNS.md`, `context/ARCHITECTURE.md` y varios más describen la
  época **SSR Jinja2 + Alpine** (sustituida por la SPA React el 2026-05-22) y el
  modelo **multi-tenant estricto** (retirado).

Lo que sí sigue siendo útil de esa carpeta: `context/CRM_SPEC.md` y
`context/RBAC.md` como referencia de dominio y de la matriz de roles (contrastar
siempre contra `app/security/permissions.py`), más los archivos de datos reales
(`.xlsx`, PDFs de ejemplo) que alimentan el seed de bootstrap.

**Regla:** ante cualquier contradicción, gana `CLAUDE.md` + `docs/` + el código.

---

## 7. Mapa rápido: "necesito…"

| Necesito… | Ve a |
|---|---|
| Levantar el proyecto en mi máquina | [`development/local-setup.md`](development/local-setup.md) |
| Saber cómo se nombra/estructura el código nuevo | [`development/coding-standards.md`](development/coding-standards.md) |
| Subir un cambio a producción | [`development/deployment.md`](development/deployment.md) |
| Correr o escribir pruebas | [`development/testing.md`](development/testing.md) |
| Entender un módulo de negocio | [`Atlas-ONE-Proyecto.md`](Atlas-ONE-Proyecto.md) §4 |
| Encontrar un endpoint | [`current-state/api-consumption-map.md`](current-state/api-consumption-map.md) |
| Saber qué puede hacer cada rol | `app/security/permissions.py` + [`onboarding/70_rbac_y_roles.md`](onboarding/70_rbac_y_roles.md) |
| El porqué de una decisión de diseño | `docs/superpowers/specs/` |

---

## 8. `docs/onboarding/` — histórico ⚠️

Manual de onboarding escrito en la época SSR. Conserva material útil
(`50_glossary.md`, `70_rbac_y_roles.md`, `60_troubleshooting.md`), pero varias
partes ya no aplican: `10_project_overview.md` describe la app como "SSR con
Jinja2 + Alpine" y `30_dev_workflow.md` documenta credenciales iniciales que ya
no son las que crea el seed. Para setup, usa
[`development/local-setup.md`](development/local-setup.md), que está verificado
contra el código actual.

## Auditoría de agosto 2026

| Documento | Contenido |
|---|---|
| [`current-state/auditoria-2026-08.md`](current-state/auditoria-2026-08.md) | **Empieza aquí** — resumen ejecutivo, 8 hallazgos prioritarios y plan de ejecución por olas |
| [`current-state/bugs-funcionales.md`](current-state/bugs-funcionales.md) | Bugs con ruta de reproducción y fix sugerido (top 15 por severidad) |
| [`current-state/consistencia-visual.md`](current-state/consistencia-visual.md) | Desviaciones del design system cuantificadas y cobertura de estados por página |
| [`current-state/inventario-sin-uso.md`](current-state/inventario-sin-uso.md) | Código muerto, endpoints sin consumidor y capacidad construida sin cablear |
| [`product/oportunidades-por-modulo.md`](product/oportunidades-por-modulo.md) | Los 21 módulos evaluados como herramienta de trabajo: top 20 y quick wins |
