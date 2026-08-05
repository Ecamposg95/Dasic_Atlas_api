# Consistencia visual — agosto 2026

> Medición sobre 289 archivos, 35 páginas y 20 primitivas. Todos los conteos son ocurrencias reales.

## Top 10 correcciones por impacto/esfuerzo

| # | Corrección | Alcance | Esfuerzo |
|---|---|---|---|
| 1 | **Variantes `dark:` en `lib/status-tones.ts:4-8`** | 5 líneas → 11 archivos | trivial |
| 2 | Corregir el mapa canónico (`inactivo`/`borrador`/`descartado` → neutral, `prospecto` → info) y borrar los 3 mapas locales | ~20 líneas | trivial |
| 3 | Redefinir el cva de `Button` (`default → h-9`, añadir `icon-sm`) y poner `size` en los 15 footers de modal huérfanos | 15 sitios + 1 archivo | trivial |
| 4 | `rounded` a secas → `rounded-md` | **164 sitios** | trivial |
| 5 | Unificar el icono de editar a `Pencil` (retirar `Pen`, `Edit2`, `Edit3`) | 17 | trivial |
| 6 | Declarar `size` explícito en modales y bajar los formularios de entidad a `md` | 7 | trivial |
| 7 | Unificar padding de celda a `px-4 py-3` en los 7 listados densos | 7 archivos | trivial |
| 8 | **Crear `<QueryError onRetry>` y adoptarla en las 30 páginas sin manejo de error** | 1 + 30 | medio |
| 9 | Migrar los ~50 `"Cargando…"` a skeleton (empezando por el dashboard, con 5 en la pantalla de entrada) | ~50 | medio |
| 10 | Unificar el botón-acción-de-fila a `Button variant="ghost" size="icon-sm"` | ~30 | medio |

## El bug: tonos de estado sin tema claro

`lib/status-tones.ts:4-8` no tiene **ni un** prefijo `dark:` y usa tonos de la rampa oscura (`text-emerald-400` sobre `bg-emerald-500/15`). En tema claro eso da un contraste ≈1.8:1 contra el mínimo de 4.5:1 de WCAG. Afecta a los 11 archivos que usan `StatusBadge`. `badge.tsx:12-16` sí lo hace bien — es una omisión, no un criterio.

## Divergencias semánticas de color

El mapa canónico contradice a las pantallas en cuatro estados. Lo más notable: **`inactivo` es rose (danger) en el canónico y gris en las 3 pantallas que lo pintan** — un cliente inactivo no es un error; el canónico está mal. Igual con `borrador` (canónico dice info, dos pantallas dicen neutral) y `descartado`. `cancelada` diverge en 1 de 4 sitios y `cotizacion` en 1 de 2.

`features/remisiones/lib/estado.ts` documenta explícitamente por qué no usa el mapa global — divergencia deliberada y argumentada, no defecto.

**Dos primitivas para el mismo rol:** `Badge` (cuadrado, mayúsculas, 32 archivos) y `StatusBadge` (píldora, minúsculas, 11 archivos), con **8 archivos usando ambas en la misma tabla**. La distinción que insinúa el código y conviene formalizar: píldora = estado de entidad, cuadrado = etiqueta/taxonomía.

## Escalas en conflicto

**Botones:** 218 usan la primitiva, 152 son `<button>` crudos. El `size="default"` (h-10) del cva está de facto muerto (15 usos, todos footers de modal) frente a 193 `size="sm"` — resultado: el footer de "Editar contacto" es 4px más alto que el de "Editar planta" en el mismo flujo. Los botones-icono de fila se escriben de **6 formas distintas**, y 26 de ellos tienen área táctil de ~24px, por debajo del mínimo de accesibilidad.

**Tipografía:** 291 usos de tamaños arbitrarios (`text-[10px]`, `[11px]`, `[9px]`, `[13px]`) — el 25 % de la tipografía fuera de la escala. Los micro-labels en mayúsculas usan 4 tamaños para el mismo rol. `CardTitle` define `text-lg` pero el 80 % de los títulos de card en features son `text-sm`/`text-xs` en `<h3>` crudo: la primitiva y la práctica están divorciadas. Los valores numéricos usan 4 tamaños y solo 3 de 12 llevan `tabular-nums` (los demás "bailan" al actualizar).

**Espaciado:** ocho valores de `space-y-*` sin criterio (empate exacto 41/41 entre `space-y-3` y `space-y-4` — eso no es una decisión, es azar). `gap-1` (89) y `gap-1.5` (55) compiten en el mismo rol con 2px de diferencia. Los contenedores tipo card escritos a mano usan 8 paddings distintos mientras la primitiva `Card` usa `p-6`, un valor que **ningún consumidor real quiere** (se sobrescribe siempre).

**Radios:** `rounded` a secas (164 sitios) no corresponde a ninguna primitiva — es un radio que el sistema nunca definió, y es la desviación más numerosa del documento.

**Bordes:** `border-border` (174) vs `border-border-strong` (85) al 50/50 en el mismo rol de contenedor. Todas las primitivas usan el primero; el segundo se concentra en cotizador/clientes/compras sin regla aparente. Su uso legítimo es hover/selected.

**Iconos:** cuatro glifos para "editar" (`Pencil` 24, `Pen` 13, `Edit3` 2, `Edit2` 2) — editar producto y editar fantasma usan iconos distintos en filas idénticas. `h-3` (99) y `h-3.5` (97) están empatados y son indistinguibles; `Truck` aparece en 4 tamaños.

**Modales:** 35 usan la primitiva, 8 tienen shell propio (todos en cotizador) **sin focus trap** — defecto de accesibilidad real. Los formularios CRUD de entidad usan 4 tamaños distintos: contacto (`md`) y cliente (`lg`) son de complejidad casi idéntica y en el mismo flujo, con 224px de diferencia de ancho.

## Cobertura de estados por página (34 con datos)

| Estado | Bien | Subestándar | Ausente |
|---|---|---|---|
| Loading | 11 (skeleton) | 18 (texto "Cargando…") | 5 |
| Empty | 8 (`EmptyState`) | 17 (celda o texto suelto) | 8 |
| **Error** | **4** | 0 | **30** |

El error state es el único eje con cobertura efectiva nula: `isError` aparece en 3 archivos de toda la SPA, y el `ErrorBoundary` global no captura fallos de React Query. Una consulta caída deja la página idéntica a "sin datos", indefinidamente.

Además, **11 archivos meten "Cargando…" dentro de `DataTableEmpty`** — el slot de *vacío*, no de *carga*.

## Densidad de tablas

Dos escuelas al 50/50: `px-4 py-3` en 13 listados (~211 celdas) y `px-3 py-2` en 7 (~142). `RemisionesPage` usa **ambas en el mismo archivo**. El estándar recomendado es el cómodo, porque el texto ya es `text-xs`.

`maxBodyHeight` está bien adoptado (29 sitios) pero con 6 escalas distintas; el listado principal de usuarios y el de usuarios de plataforma quedaron sin acotar ni sticky, y la tabla de selección de partidas de remisiones —que puede ser larga— tampoco.

17 tablas viven fuera de la primitiva con 4 tamaños de texto, incluido un `text-[13px]` único en todo el proyecto.
