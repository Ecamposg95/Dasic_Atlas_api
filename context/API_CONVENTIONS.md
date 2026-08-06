# API Conventions (DASIC CRM Industrial)

## Prefix

- API: `/api/...`
- SSR: rutas sin `/api` (Jinja2)

## Headers

- `X-Organization-ID`: obligatorio para endpoints de negocio.
- `X-Branch-ID`: opcional.

## Auth (SSR)

- JWT en cookie HttpOnly.
- Para llamadas API desde el browser, el cookie se envia automaticamente.

## Paginacion

Respuesta estandar:

```json
{
  "items": [],
  "total": 0,
  "limit": 50,
  "offset": 0
}
```

## Errores

- `/api/*`: errores JSON.
- SSR: redireccion a login/unauthorized segun corresponda.

## Multi-tenancy

- Ningun endpoint de negocio debe funcionar sin `X-Organization-ID`.
- Todas las queries deben filtrar por `organization_id`.
