# Auditoría UX

> Auditoría Task Pack 00 · 2026-08-03. El sistema ya tiene un design system premium (tokens HSL, dark near-black, microinteracciones) — la deuda UX principal es de **adopción incompleta y patrones faltantes**, no de ausencia de diseño.

## Fortalezas (preservar)

- Dark theme premium coherente en chrome, primitivas, cotizador, CRM y analítica.
- Sidebar por grupos (8 secciones) definido como config (`SECTIONS[]`), con drawer móvil + overlay + Escape.
- Kanban CRM con drag-and-drop nativo y update optimista.
- Toasts, confirmaciones (`ConfirmHost`), ErrorBoundary, auto-reload anti chunk-stale.
- Carrito de documentos compartido (cotizador/OC/remisión) — patrón maestro ya probado.
- Code-splitting por página.

## Problemas por severidad

### Importantes (percepción inmediata)

1. **Inconsistencia visual entre páginas migradas y no migradas a tokens.** 87 archivos aún en paleta `slate-*`: al navegar de CRM (tokens) a Superadmin/Dashboard/Inventario (slate) cambia la luminancia y el feel. Es el mayor "delta visible" pendiente y su mapeo ya está definido (8 pares por feature).
2. **Sin PageHeader estándar.** Cada página improvisa título/acciones/contexto → jerarquía visual dispareja; no hay breadcrumbs en ningún detalle (`/spa/empresas/:id` aterriza sin contexto de vuelta).
3. **Estados vacíos pobres.** Solo `DataTableEmpty` (una celda con texto); sin empty states útiles con acción (crear primero, limpiar filtros).
4. **Skeletons ad-hoc o spinners inconsistentes** entre features.
5. **Modal-centrismo.** 30 modales; formularios grandes (OC 358 L, Producto 339 L) viven en modales donde un drawer o página dedicada daría más espacio y menos error.
6. **Dashboard**: KPIs + gráficas correctas, pero los indicadores no siempre navegan a vistas filtradas (verificar por tarjeta); falta franja ejecutiva accionable y agenda.

### Moderados

7. Guard de auth post-render → flash de UI antes del redirect en sesión expirada.
8. Sin 404: URL rota dentro de `/spa/*` deja el outlet vacío.
9. Sidebar sin versión colapsada en desktop (solo abierto/oculto móvil); sin persistencia de preferencia.
10. Búsqueda global inexistente (ni command palette); búsqueda solo por listado.
11. Filtros no persistentes al volver del detalle (varía por página).
12. Formularios sin patrón FormField/FormSection: labels/errores/ayuda replicados a mano en 12 FormModals; sin advertencia de cambios sin guardar.
13. Tablas sin ordenamiento consistente ni conteo de resultados uniforme (DataTable es solo markup).
14. Responsive: chrome sí; tablas anchas caen a scroll horizontal sin fallback (revisar cotizador en tablet — flujo crítico de demo).

### Menores

15. `Header` ofrece "Mi perfil"/"Configuración" deshabilitados ("Próximamente") — promesas muertas en el menú.
16. Placeholders con emails de dominio real (`usuario@dasic.com`) en formularios.
17. Título del documento (`<title>`) estático — no refleja la página actual.

## Accesibilidad (muestreo)

- Positivo: `useFocusTrap` y `useDismiss` existen para modales; foco visible vía `ring` tokens en primitivas.
- Pendiente de validar sistemáticamente (Task Pack 15): navegación por teclado en Kanban DnD, contraste de la paleta slate en light mode, `aria-*` en tabs/modales ad-hoc, labels de iconos-botón.

## Nota sobre baseline visual

No se capturaron screenshots en esta auditoría (entorno WSL sin browser conectado ni credenciales de entorno local). Queda como acción de Task Pack 01 con el dev server levantado.
