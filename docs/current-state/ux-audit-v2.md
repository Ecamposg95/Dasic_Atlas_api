# Auditoría UI/UX v2 — 2026-08-04 (post-rediseño de shell)

> Estado auditado: `main` @ `af1fa9f`. Sustituye a `ux-audit.md` como referencia activa. Severidades: CRÍTICO / IMPORTANTE / DESEABLE / MENOR.

**Resumen ejecutivo:** el design system está bien definido (tokens HSL, 19 primitivas) y la mayoría de features migró. Quedan dos islas sin migrar (**cotizador** ~113 slate y **superadmin** ~76), de las cuales superadmin estaba **roto en tema claro** (dark-only sin pares `dark:`). Los hallazgos de accesibilidad son sistémicos: 8 de 182 `<label>` con `htmlFor`; sin focus trap en `Modal`/`Drawer` (corregido 2026-08-04). En responsive: cero fallbacks móviles en 16+ tablas.

## Críticos

1. **Superadmin ilegible en tema claro** — texto claro sobre fondos oscuros fijos sin par `dark:` (`AuditPage.tsx:79,155,163`, `SaludPage.tsx:29,81,156,203`, `MantenimientoPage.tsx:157+`, `ConfigPlataformaPage.tsx:76,97`, `UsuarioPlataformaModal.tsx:125,149`, `ResetPasswordPlataformaModal.tsx:42`, `PlatformShell.tsx:77,95`). → **En corrección (agente) 2026-08-04.**
2. **`ui/modal.tsx` sin focus trap, `role="dialog"`, `aria-modal`, `aria-labelledby` ni aria-label en cerrar** — afectaba ~15 modales incl. los 10 formularios. → **Corregido 2026-08-04.**
3. **`ui/drawer.tsx` sin focus trap** (tenía role/aria-modal). → **Corregido 2026-08-04.**
4. **Labels sin asociar: 8 `htmlFor` para 182 `<label>` (4%)** — clic en label no enfoca; lectores de pantalla anuncian inputs sin nombre. Sistémico en todos los FormModal. → Requiere primitiva `FormField` + adopción (Fase 3).

## Importantes

- **Formularios:** sin abstracción `FormField` (114 repeticiones exactas de `<label className="block text-xs text-muted-foreground mb-1">`); 5 variantes distintas de asterisco de requerido (y modales que no marcan, ej. `PrecioFormModal.tsx:70`); **ningún FormModal usa `<form onSubmit>`** → no se puede enviar con Enter; `required`/`aria-required` casi inexistentes (validación 100% imperativa).
- **PageHeader ausente en 13 de 33 páginas** → conviven 3 tamaños de H1 (`text-lg` CrmKanban, `text-xl` Cotizador, `text-2xl` Reportes/Docs) + el estándar. `KpisPage` no tiene H1 en absoluto.
- **Layout:** 6 anchos máximos distintos (`max-w-2xl…7xl`); cotizador (`p-4 w-full` sin max-w) y CRM (`px-4 pt-4`) divergen del patrón dominante `p-6 max-w-7xl mx-auto` (17 páginas); `space-y` varía 3/4/5/6/8.
- **Responsive:** cero fallbacks móviles en tablas (0 resultados de `md:hidden`/`hidden md:block` en features); `ui/data-table.tsx:22` fuerza `min-w-[640px]` solo en móvil (invertido); carrito cotizador `min-w-[680px]`; 15 tablas crudas fuera de DataTable varias sin `overflow-x-auto`; 21 grids `grid-cols-2/3` sin breakpoint en modales; **cotizador no usable en móvil** (header con 6+ acciones, pickers `min-w-[260px]+`).
- **Contraste:** 46 usos de `text-muted-foreground/70` como texto informativo → ~2.9:1 en tema claro sobre `bg-surface-2` (WCAG AA pide 4.5:1). +3 usos de `/60`.
- **Botones icono sin aria-label/title** en features (cierres de overlays ad-hoc: catalogos tabs, PromoverModal, KardexModal, AgregarLineaFantasmaModal, AtajosPopover…). Solo 16 archivos con algún `aria-label` (el shell nuevo sí está bien etiquetado).
- **Navegación:** las 17 rutas legacy (`/dashboard`, `/clientes`, …) devuelven `null` en `breadcrumbFor` (alcanzables por bookmark); 5 subpáginas superadmin comparten breadcrumb genérico; breadcrumb de detalle de empresa no dinámico.
- **Modales gigantes** (candidatos a página/drawer): `AgregarFantasmaModal` 407 L, `OrdenCompraFormModal` 358 L (tabla editable dentro de modal), `ProductoFormModal` 339 L, `EditLineModal` 329 L. Y **14 overlays ad-hoc** con `fixed inset-0` propio que reimplementan backdrop/Escape (3 tabs de catalogos, PromoverModal, FantasmasPage, KardexModal, AgregarLineaFantasmaModal + 7 de cotizador).
- **`ErrorBoundary`** (pantalla de fallo global) en slate fijo sin tokens.
- **Cotizador:** 113 `slate-*` restantes (mayoría con par dark:, menos grave que superadmin) — mezcla de tokens y hardcode en el mismo archivo.

## Deseables / menores

- `ui/tabs.tsx` con 1 solo consumidor; 3 páginas hacen tabs a mano (`KpisPage:22`, `CatalogosPage`, `EmpresaDetallePage`).
- 9 `animate-pulse` ad-hoc restantes (reportes ×5, dashboard charts ×3, RegistrarPagoModal ×1).
- 3 páginas replican el layout de EmptyState a mano dentro de `<td>` (Clientes:304, Inventario:358, Servicios:216).
- Mezcla `<Select>` primitiva y `<select>` crudo en el mismo modal (`ServicioFormModal:103,179`).
- `EmpresaDetallePage` es la única con padding responsive (`p-4 md:p-6`) — irónicamente el mejor patrón.
- Breadcrumb no refleja tab activo en `/spa/analitica?tab=…`.
- `ProductSearch.tsx:155` `bg-violet-900/30 text-violet-300` sin par claro. `AgregarFantasmaModal:182` `bg-white dark:bg-slate-900` en vez de `bg-card`. `RowExpanded.tsx:145` `border-slate-600` invisible en claro.

## Sin hallazgos (limpio)

- UX muerta / "Próximamente" / TODOs visibles: 0.
- Imágenes sin `alt`: 0.
- Contaminación de paletas neutras alternativas (gray/zinc/neutral/stone como neutros): 0.
- Sidebar negro en ambos temas: decisión de producto documentada e implementada consistentemente.
- Disabled permanentes: 0 (los 3 existentes son placeholders/carga legítimos; `TotalsBar` explica el porqué del disabled — buen patrón).

## Orden de ataque sugerido

1. ✅ Focus trap + ARIA en Modal/Drawer (hecho 2026-08-04)
2. ✅ Superadmin tema claro (en curso 2026-08-04)
3. `FormField` primitiva (label+htmlFor+required+error) + `<form onSubmit>` + adopción en los 12 FormModal — resuelve crítico #4 y 3 importantes de formularios de una vez (Fase 3 / TP08)
4. PageHeader en las 5 páginas de features restantes + contenedor de página estándar
5. DataTable responsive (quitar min-w móvil, agregar `overflow-x-auto` a tablas crudas) + breakpoints en grids de modales
6. Contraste: revisar los 46 usos de `/70` (subir a pleno donde el texto es informativo)
7. Cotizador: tokens residuales + plan móvil (posible vista dedicada)
8. Breadcrumbs para rutas legacy (o redirect 301 a `/spa/*` — más simple)
9. Migrar los 14 overlays ad-hoc a Modal/Drawer primitivas
