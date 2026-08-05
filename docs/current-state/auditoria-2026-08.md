# Auditoría integral — agosto 2026

> **Los pendientes ya no viven aquí.** El orden de trabajo consolidado está en [`backlog.md`](backlog.md); este documento se conserva como el diagnóstico que lo originó.


> Cinco auditorías paralelas sobre el repo completo: UI muerta · capacidad backend sin consumir · consistencia visual · bugs funcionales · robustez por módulo. Todo hallazgo tiene evidencia `archivo:línea` verificada por grep o lectura del código; nada se reporta por sospecha.
>
> **Documentos de detalle:** [`bugs-funcionales.md`](bugs-funcionales.md) · [`consistencia-visual.md`](consistencia-visual.md) · [`inventario-sin-uso.md`](inventario-sin-uso.md) · [`../product/oportunidades-por-modulo.md`](../product/oportunidades-por-modulo.md)

## Resumen ejecutivo

El sistema está **funcionalmente sano y con buena higiene**: cero botones vacíos, cero "Próximamente", cero `console.log` decorativos, cero funciones locales sin usar, confirmaciones destructivas bien cubiertas (43 sitios con el nombre del registro), y protección contra doble submit en todos los formularios. La deuda no está en chapuzas, está en tres lugares concretos:

1. **Datos que se muestran viejos.** El caché no se invalida en cadena: emitir una remisión no refresca el avance de entrega ni los pendientes, recibir una orden de compra no refresca el inventario, registrar un pago no refresca el saldo de la pestaña de al lado. Con `staleTime` de 30 s y sin refetch al enfocar la ventana, **cada omisión es dato viejo visible en pantalla**, no una teoría.
2. **Capacidad construida y nunca conectada.** 32 endpoints sin consumidor (envío de cotización por correo con adjunto, resumen IA, timeline de eventos, disponibilidad real de stock, reconciliación de saldos), dos feature flags inalcanzables por no estar en una whitelist, y piezas de UI listas sin cable (la validación inline de `FormField` que ignoran los 18 formularios, `modulos_visibles` que el backend calcula y el menú no lee).
3. **Deriva visual de varias manos.** 164 usos de un radio que el sistema nunca definió, cuatro iconos distintos para "editar", dos primitivas de badge compitiendo, y el error state con **0 % de cobertura**: una API caída se ve exactamente igual que "no hay datos".

## Los 8 hallazgos que hay que atender primero

| # | Hallazgo | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | **Las mutaciones de remisión no invalidan los pendientes ni el avance de entrega.** El editor precarga cantidades pre-emisión → el usuario intenta entregar de más y recibe un 400 (o consuma una sobre-entrega si tiene el permiso). | Operativo crítico | S |
| 2 | **`modulos_visibles` se recibe y se ignora.** Ventas y Operativo ven en el menú módulos que el backend rechaza con 403 (Gastos, Usuarios, Compras, CxC). El usuario aprende que "el sistema falla". | Confianza | S |
| 3 | **Acciones de remisión sin control de rol.** "Recibir", "Cancelar" y "Crear cotización" se muestran a roles que el backend rechaza. Mismo síntoma que #2, en la pantalla más operativa. | Confianza | S |
| 4 | **`status-tones.ts` no tiene variantes para tema claro.** Contraste ≈1.8:1 (mínimo WCAG: 4.5:1) en los 11 archivos que pintan estado con esa paleta. Es accesibilidad, no gusto. | Legibilidad | S |
| 5 | **El cotizador re-hidrata el carrito en cada refetch.** Guardar dispara un refetch que pisa ediciones en vuelo y colapsa las filas expandidas. | Pérdida de trabajo | M |
| 6 | **Cotización guardada muestra "Sin stock · OC" con stock real.** Al reabrir, el stock máximo se hidrata en 0 → el comercial genera órdenes de compra innecesarias. | Decisión errónea | S |
| 7 | **Filtro de marca en inventario filtra solo la página actual** aunque el backend ya soporta el filtro server-side. Con catálogo grande, el filtro miente. | Datos incorrectos | S |
| 8 | **El cotizador muestra stock crudo, no disponible.** `stock − reservas` existe como endpoint y nadie lo llama → se compromete material ya reservado en otra cotización. | Sobreventa | M |

## Hallazgos transversales

**Caché y frescura.** 13 mutaciones con invalidación incompleta, una con la key equivocada (`['compras']` cuando la real es `['ordenesCompra']` — no refresca nada), y dos query keys distintas para el mismo endpoint de borradores. Ninguna mutación invalida el dashboard: sus alertas y KPIs pueden estar arbitrariamente viejos.

**Estados de página** (34 páginas con datos): loading con skeleton en 11, con texto "Cargando…" en 18, sin nada en 5. Empty state real en 8. **Error state en 4.** El `ErrorBoundary` global no captura fallos de React Query, así que una consulta caída deja la página indistinguible de "sin resultados", indefinidamente.

**Filtros y persistencia.** Ningún módulo persiste filtros: navegar a un detalle y volver los pierde. Solo 4 pantallas los reflejan en la URL, así que casi nada es compartible por link. Exportación: **un solo endpoint CSV** en todo el backend y un solo export en cliente — los módulos contables (gastos, cobranza, inventario) no tienen salida a Excel.

**Zonas horarias.** `toISOString().slice(0,10)` en fechas de cotización y de override de TC: después de las 18:00 hora de México, los documentos nacen fechados un día adelante.

## Plan de ejecución por olas

**Ola 1 — Corrección (todo es S, sin riesgo de diseño).** Invalidaciones de caché en cadena (remisiones, compras→inventario, FX→cotizador, pagos→saldos, borradores), gateo de menú y acciones por permisos reales, variantes de tema claro en los tonos de estado, `max` de stock al hidratar, filtro de marca server-side, fechas en zona local, y el toast que imprime `undefined` al convertir a venta.

**Ola 2 — Limpieza.** Borrar el árbol huérfano del editor viejo de remisiones (~620 líneas en 3 archivos, ya declarado temporal en el router), el rastro de `cantidad_max`/`qtyMax` (el backend no lo devuelve y arrastra 3 ramas de render inalcanzables), el endpoint legacy de KPIs del dashboard (carga la tabla de productos entera en cada request), las 4 rutas de compras sustituidas, el modelo `Promocion` sin uso y 8 schemas huérfanos.

**Ola 3 — Cablear lo construido.** Los cinco cables de mayor retorno: validación inline en los 18 formularios, menú filtrado por módulos, métricas por etapa del pipeline (ya se descargan y se tiran), disponibilidad real de stock en el cotizador, y el registro de pago desde la fila de vencimientos de cobranza (el modal existe y no está conectado). Más los dos feature flags que solo necesitan entrar a la whitelist: descuento de stock en remisión y nombre de empresa en documentos.

**Ola 4 — Consistencia visual.** Las 7 correcciones triviales del design system (radios, icono de editar, tamaños de botón y modal, densidad de tabla, mapa canónico de estados) y las 2 medianas de alto impacto: primitiva de error con reintento adoptada en las 30 páginas sin manejo, y migración de los ~50 "Cargando…" a skeleton.

**Ola 5 — Producto.** El top de oportunidades por módulo: exportación donde falta, filtros del Kanban de CRM, filtro de vencimiento server-side en seguimiento, impresión masiva de remisiones, cuentas por pagar, y la ampliación de la auditoría más allá de cotizaciones y fusiones (hoy borrar un cliente, cambiar un precio o ajustar stock no deja rastro).

## Nota de método

Las cinco auditorías corrieron en paralelo sobre ejes disjuntos y se cruzaron entre sí: el bug del filtro de marca lo encontró la auditoría de backend (el parámetro existe) y lo confirmó la de bugs (el frontend filtra en cliente); el problema de permisos lo encontraron dos agentes por caminos distintos. Donde un hallazgo aparece en dos documentos, la evidencia es independiente.
