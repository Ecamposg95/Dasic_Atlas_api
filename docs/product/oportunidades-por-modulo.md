# Oportunidades por módulo — agosto 2026

> Evaluación de los 21 módulos como herramienta de trabajo real: filtros, acciones masivas, exportación, reversibilidad, vacíos de flujo y saltos entre módulos. Pensado desde el usuario: vendedor cotizando, almacén remisionando, administración cobrando.

## Cinco patrones transversales

Explican el 70 % de las oportunidades:

1. **Cero persistencia de filtros.** Ningún módulo los guarda; navegar a un detalle y volver pierde búsqueda, filtros y página.
2. **Filtros casi nunca en la URL.** Solo 4 pantallas los reflejan → prácticamente nada es compartible ni marcable.
3. **Exportación casi inexistente.** Un endpoint CSV en todo el backend y un export en cliente. Los módulos contables no tienen salida a Excel.
4. **Selección múltiple en 2 de 21 módulos** (clientes y fantasmas).
5. **Atajos de teclado solo en el cotizador**, y el hook que los implementa es genérico y reutilizable — nadie más lo importa, ni siquiera el editor de remisiones.

Lo que sí está bien y conviene preservar: el `confirm()` con tono y nombre del registro se usa en 43 sitios, y los botones cubren su estado de envío.

## Top 20 de oportunidades

| # | Oportunidad | Módulo | Valor | Esf. |
|---|---|---|---|---|
| 1 | Registrar pago desde la fila de vencimiento (**el modal ya existe sin cablear**) | CxC | Alto | S |
| 2 | Export CSV de gastos | Gastos | Alto | S |
| 3 | Export CSV de inventario (importa pero no exporta) | Inventario | Alto | S |
| 4 | Export CSV del aging | CxC | Alto | S |
| 5 | Búsqueda y filtro por responsable en el Kanban (**hoy no tiene ni un filtro**) | CRM | Alto | M |
| 6 | Filtro de vencimiento server-side (hoy filtra solo la página → **es un bug**) | Seguimiento | Alto | M |
| 7 | Filtro activo/inactivo (la columna existe, el filtro no) | Servicios | Alto | S |
| 8 | Combobox con typeahead en el filtro de producto (hoy un `select` capado a 500) | Precios | Alto | S |
| 9 | Búsqueda y filtro por antigüedad | Borradores | Alto | S |
| 10 | Persistir filtros y llevarlos a la URL (un hook, adopción incremental) | Global | Alto | M |
| 11 | Ampliar la auditoría más allá de cotizaciones y fusiones | Superadmin | Alto | L |
| 12 | Adjuntar comprobante al gasto | Gastos | Alto | L |
| 13 | Impresión masiva de remisiones (la ruta del día, hoy una por una) | Remisiones | Alto | M |
| 14 | Crear reporte desde su propio módulo (**el botón está deshabilitado**) | Rep. servicio | Alto | M |
| 15 | Cuentas por pagar con aging de proveedores | Compras | Alto | L |
| 16 | Rangos de fecha personalizados y export | Analítica | Alto | M |
| 17 | Atajos en el editor de remisiones (reusar el hook existente) | Remisiones | Alto | S |
| 18 | Posponer rápido (+1 día / +1 semana) sin abrir modal | Recordatorios | Alto | S |
| 19 | Importación masiva de listas de precios (los proveedores mandan Excel) | Precios | Alto | M |
| 20 | Filtro por proveedor y rango de fechas | Compras | Alto | S |

## Quick wins (alto valor, esfuerzo S)

Doce cambios acotados, casi todos en un solo archivo:

1. **CxC** — cablear el modal de registrar pago en la fila de vencimiento; el componente y su hook ya existen sin usarse.
2. **Gastos** — botón de export CSV (hay un helper que copiar en fantasmas).
3. **Inventario** — export con las mismas columnas que acepta el import, para cerrar el ciclo editar-y-resubir.
4. **CxC** — export del aging y de vencimientos.
5. **Servicios** — filtro activo/inactivo en la barra de herramientas.
6. **Precios** — sustituir el `select` de producto por un combobox con búsqueda.
7. **Borradores** — barra de herramientas con búsqueda y filtro de antigüedad (el dato ya se calcula para mostrarlo).
8. **Compras** — filtro por proveedor y rango de fechas.
9. **Recordatorios** — botones de posponer rápido en la fila.
10. **Remisiones** — importar el hook de atajos en el editor.
11. **Contactos** — hacer clicables el correo, el teléfono y WhatsApp (hoy son texto plano en un CRM).
12. **Catálogos** — campo de búsqueda en marcas, categorías y unidades (solo el tab SAT lo tiene).

**Bonus de consistencia:** migrar los 6 listados que rehacen la paginación a mano a la primitiva, para mostrar "Página 3 de 12" en vez de "hay más registros".

## Notas por módulo

**Dashboard** — todo hardcodeado a "mes actual" sin comparación; las alertas llevan al listado genérico, no al folio; el bloque de recordatorios es de solo lectura.

**CRM** — el detalle de deal es la mejor vista del sistema; el Kanban es el módulo con peor herramienta de filtrado (ninguna). Falta motivo de pérdida y filtro de deals estancados.

**Cotizador** — la referencia de calidad (confirmaciones contextuales, búsqueda difusa, import/export de borrador). Brechas de segundo orden: filtros del historial client-side, sin deshacer, sin envío por correo, sin autoguardado.

**Seguimiento** — el módulo con más acciones por fila (7 iconos sin etiqueta, riesgo de clic equivocado en "Convertir a venta", que es irreversible).

**Clientes** — el más profundo (8 tabs, fusión de empresas, notas, timeline). Falta export del padrón y que el tab activo viva en la URL.

**Compras** — el detalle vive en un modal para un documento con partidas, recepciones y pagos; no se puede cancelar una OC ni duplicarla para reorden recurrente.

**Remisiones** — el listado mejor construido del sistema y el modelo a copiar. Falta impresión masiva y evidencia de entrega.

**Gastos** — los mejores filtros (con totales server-side del conjunto filtrado, no solo la página) y ninguna salida a Excel.

**Inventario** — único con importación masiva; asimétricamente, sin exportación. El kardex no tiene filtros ni salida.

**Precios** — los filtros son dos `select` que cargan 500 productos: inutilizable con catálogo real. Sin edición de precio (corregir = borrar y recrear, perdiendo la fecha).

**CxC** — analíticamente el mejor pensado; operativamente es solo lectura: quien cobra tiene que ir cliente por cliente.

**Superadmin** — la zona roja y la config en runtime están bien resueltas; la auditoría solo cubre 2 fuentes de 20+ acciones sensibles: **borrar un cliente, cambiar un precio o ajustar stock no dejan rastro**. Es el hueco de gobernanza más grande.
