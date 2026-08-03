# Inventario de componentes UI

> Auditoría Task Pack 00 · 2026-08-03.

## Primitivas existentes (`web/src/components/ui/` — 15 archivos, 636 líneas)

| Primitiva | Archivo | Notas |
|---|---|---|
| Button | `button.tsx` | cva, variantes, glow en primario |
| Input / Textarea / Select | `input.tsx`, `textarea.tsx`, `select.tsx` | Tokenizados |
| Card / CollapsibleCard | `card.tsx`, `CollapsibleCard.tsx` | |
| Badge / StatusBadge | `badge.tsx`, `status-badge.tsx` (+ `lib/status-tones.ts`) | Usado en 5+ features |
| Modal | `modal.tsx` | + `ModalFooter`; backdrop-blur |
| Tabs | `tabs.tsx` | |
| DataTable | `data-table.tsx` | Primitivas de markup (Head/Body/Row/Empty); **sin** sorting/paginación integrada |
| Pagination | `pagination.tsx` | |
| ListToolbar | `list-toolbar.tsx` | Proto-FilterBar |
| Toaster | `toaster.tsx` + `lib/toast.ts` | Event bus |
| SatCombobox | `sat-combobox.tsx` | Específico SAT, no genérico |

Soporte compartido: `ErrorBoundary`, `components/document/` (carrito de documentos compartido cotizador/OC/remisión), `lib/useDismiss`, `lib/useFocusTrap`, `lib/confirm.tsx` (ConfirmHost).

## Primitivas FALTANTES (vs checklist Task Pack 03)

| Faltante | Impacto | Evidencia |
|---|---|---|
| **PageHeader** | Cada página improvisa título/acciones → inconsistencia visible | 0 resultados |
| **EmptyState** | Solo `DataTableEmpty` (celda); sin estados vacíos útiles | 0 resultados |
| **Skeleton** | Duplicado ad-hoc en ≥4 archivos (borradores, cxc ×3) | grep |
| **Drawer** | 4 implementaciones ad-hoc: `EmpresaDetalleDrawer`, `ContactoHistorialDrawer`, `DrawerBorradores`, `PreviewOCDrawer` | |
| **Breadcrumbs** | Sin navegación contextual en detalles | 0 resultados |
| **Stepper** | Necesario para flujos cotización/OC | 0 resultados |
| **Timeline** | Actividad/eventos se renderiza ad-hoc | 0 resultados |
| **Combobox genérico** | Solo existe el de SAT | |
| **DatePicker** | `<input type="date">` nativo en todos lados | Aceptable, evaluar |
| **FilterBar** | `list-toolbar` es lo más cercano | |
| ConfirmationDialog | Existe vía `lib/confirm.tsx` ✅ | |

## Duplicación detectada

- **Hooks duplicados entre features:** `useProveedores` ×4 (2 byte-idénticos), `useMarcas` ×2, `useCategoriasServicio` ×2, `useClientes` ×2, `useHistorial` ×2, `useBorradores` ×2. Patrón: catálogos compartidos consultados desde features distintas sin hook común (query keys potencialmente inconsistentes → caches duplicados).
- **`RegistrarPagoModal` ×2** (compras 154 L / cxc 114 L) — casi-duplicado estructural.
- **Familia `*FormModal` ×12** (2,371 líneas) — misma convención sin abstracción de FormField/FormSection; cada modal reimplementa labels, errores, layout.
- **30 modales** en total en features; uso intensivo de modal donde un drawer/página serviría mejor (ver ux-audit).

## Branding hardcodeado (para Task Pack 14)

Cadenas "DASIC"/"Atlas ONE" incrustadas en: `web/index.html` (title), `Sidebar.tsx:104-106`, `Header.tsx:67`, `Footer.tsx:5,8`, `LoginPage.tsx` (7 sitios), placeholders `usuario@dasic.com` en 2 FormModals, `stores/theme.ts` (storage key), colores de acento hex en `tailwind.config.ts` (`#00d4e0`, `#2563eb`), gradiente avatar en `Header.tsx:94`. Único logo: `/static/img/Logo_main.png` (servido por FastAPI). **No existe módulo de branding/tenant config.**

## Adopción de tokens (design system premium 2026-06-04)

- 111 archivos `.tsx` en features: **87 usan `slate-*`** (692 ocurrencias) vs 85 con tokens (306 ocurrencias). Ratio 2.26:1.
- Top deuda slate: `cotizador` (130 — parcialmente migrado), `superadmin` (76, 0 tokens), `dashboard` (53), `inventario` (44), `compras` (42), `remisiones` (41), `clientes` (40), `fantasmas` (38), `catalogos` (37).
- 100% tokens (limpias): `crm`, `analitica`. 100% slate: `superadmin`, `auth`, `hello`.
- Mapeo de migración conocido (8 pares slate→token por feature, documentado en `context/02_REPO_CURRENT_STATE.md`).

## Higiene

- `style={{}}` inline: solo 8 ocurrencias, casi todas valores dinámicos legítimos (colores de serie, anchos %).
- `console.*`: 1 (ErrorBoundary — legítimo).
- Mocks: 1 fallback documentado (`useConfig.ts` defaults mientras carga). Sin datos simulados.
