# ADR Index (Architecture Decision Records)

Este directorio guarda decisiones tecnicas importantes del proyecto.

## Convenciones

- Nombre: `NNNN_titulo_corto.md` (ej. `0002_auth_cookie_httponly.md`)
- Estado permitido: `Propuesto`, `Aceptado`, `Reemplazado`, `Descartado`
- Toda decision que cambie arquitectura, seguridad, tenancy, DB o permisos debe tener ADR.

## Flujo

1. Crear ADR en estado `Propuesto`.
1. Revisar impacto y alternativas.
1. Cambiar a `Aceptado` cuando se implemente.
1. Si queda obsoleto, marcar `Reemplazado` y referenciar el nuevo ADR.

## ADRs

- `0000_adr_template.md`
- `0001_adopt_atlas_stack_baseline.md`
