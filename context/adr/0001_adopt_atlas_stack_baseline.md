# ADR 0001: Adoptar Atlas Stack como baseline canonico

- Fecha: 2026-04-10
- Estado: Aceptado
- Decisores: Equipo DASIC
- Relacionados:
  - `context/atlas_erp_pos_stack.md`
  - `context/STACK_ADOPTION_CHECKLIST.md`

## Contexto

El proyecto necesita una base tecnica estable para evitar decisiones inconsistentes mientras migra a un CRM industrial multi-tenant. Ya existe una referencia madura (Atlas ERP/POS) con patrones de arquitectura reutilizables.

## Decision

Se adopta `context/atlas_erp_pos_stack.md` como baseline tecnico canonico del proyecto.

Reglas asociadas:

1. Toda decision tecnica relevante debe alinearse con ese baseline.
1. Toda desviacion se documenta en `context/STACK_ADOPTION_CHECKLIST.md` (Delta DASIC).
1. Documentos derivados (`README`, `ARCHITECTURE`, `ROADMAP`, `CRM_SPEC`) se mantienen consistentes con el baseline.

## Alternativas evaluadas

1. Mantener solo documentacion propia sin baseline externo.
   - Pro: autonomia total.
   - Contra: mayor riesgo de deriva arquitectonica.
1. Copiar Atlas parcialmente sin documento canonico.
   - Pro: rapidez inicial.
   - Contra: inconsistencia y decisiones ad hoc.

## Consecuencias

- Positivas:
  - Coherencia tecnica y trazabilidad de decisiones.
  - Menor riesgo de retrabajo en DB/auth/RBAC/tenancy.
- Riesgos:
  - Exceso de rigidez si no se controlan deltas.
- Mitigaciones:
  - Se permite Delta DASIC documentado y versionado.

## Plan de adopcion

1. Mantener indice y roadmap referenciando el baseline.
1. Usar `STACK_ADOPTION_CHECKLIST.md` como control de avance.
1. Crear ADRs para decisiones futuras (auth, tenancy, migraciones, RBAC avanzado).

## Criterios de aceptacion

- El baseline aparece como canonico en `context/00_CONTEXT_START_HERE.md`.
- Existe checklist de adopcion con estados.
- Existen ADRs iniciales y plantilla para nuevas decisiones.
