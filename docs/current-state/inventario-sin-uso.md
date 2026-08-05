# Inventario de código sin uso y capacidad sin cablear — agosto 2026

> Dos auditorías cruzadas: qué existe en la UI y no sirve para nada, y qué existe en el backend que la UI nunca aprovecha. Clasificación: **BORRAR** (muerto probado) · **CABLEAR** (construido, falta conexión) · **VERIFICAR** (requiere criterio).

## Lo primero: el árbol huérfano del editor viejo de remisiones

El propio `router.tsx:47-49` lo declara temporal. Son **~620 líneas** en 3 archivos más una cascada:

| Archivo | Líneas | Evidencia | Acción |
|---|---|---|---|
| `features/remisiones/pages/CrearRemisionPage.tsx` | 477 | Único archivo huérfano del repo: cero importadores y sin ruta | **BORRAR** |
| `features/remisiones/components/RemisionProductSearch.tsx` | 16 | Solo lo importa la página anterior | **BORRAR** |
| `features/remisiones/components/PartidasSeleccionTable.tsx` | 128 | Solo lo importa la página anterior | **BORRAR** |
| `features/cotizador/components/ProductSearch.tsx:12-20` | prop `handlers` + su tipo | Su único consumidor es `RemisionProductSearch` | **BORRAR** (cascada) |
| `features/remisiones/store.ts:56,111` | `hydrateFromBorrador` | Su única llamada externa es la página muerta | Degradar a privada |

## Rastro de `cantidad_max` — campo legacy con UI inalcanzable

El backend **no devuelve** `cantidad_max` (0 hits en `app/`) y los 8 sitios del frontend que lo escriben lo ponen en `null`. Consecuencia: `vm.qtyMax` es null en el 100 % de los productores, y arrastra código muerto en `DocumentRow.tsx` (`:27` el tope nunca topa, `:199` y `:488-489` los textos "de {N}" nunca aparecen) más el campo en `document/types.ts:40`. **BORRAR** todo el rastro.

Relacionado: `caps.permitirExceso` (`DocumentRow.tsx:26`) tiene una rama que ningún caller puede ejecutar — el cotizador nunca setea `entregas` y remisiones fija `permitirExceso: true`. El tope real lo aplica el backend al emitir. **VERIFICAR** (salvaguarda inerte, no dañina).

## Los cinco cables de mayor retorno

Cosas construidas a las que solo les falta la conexión:

| Qué | Dónde | Por qué importa |
|---|---|---|
| **`FormField.error`** | `components/ui/form-field.tsx:13,49` | Primitiva de validación inline lista; **18 formularios** la ignoran (0 pasan `error=`). Hoy los errores solo llegan por toast |
| **`modulos_visibles`** | `stores/auth.ts:10` vs `permissions.py:276` | El backend lo calcula por rol; el sidebar no lo lee y muestra módulos que darán 403 |
| **`PipelineMetricas.por_etapa`** | `features/crm/types.ts:147` | Se descarga en cada request del Kanban y se tira: las métricas por etapa ya están pagadas |
| **`DealFormModal.defaultStageId`** | `features/crm/components/DealFormModal.tsx:18` | Preselección de etapa lista; falta el botón "+" por columna del Kanban |
| **Modal de generar reporte de servicio** | `ReportesServicioDocsPage.tsx:306` | Montado en la página pero solo se abre por un evento que dispara el cotizador → inalcanzable desde su propio módulo |

## Props y ramas inalcanzables

`CollapsibleCard.badge` (5 consumidores, ninguno lo pasa) · `TabsCotizador.countHistorial` (badge de conteo nunca visible) · `CancelarRemisionModal.onCancelada` (nunca ejecuta) · `OrdenPicker.disabled` (3 ramas siempre falsas) · `Button.variant="link"` (0 usos, mientras 7 sitios escriben botones-enlace a mano) · `Button.asChild` + su import de Radix Slot (nunca se instancia) · tonos `success/warning/danger` de `Timeline` (el único consumidor pasa solo `accent`/`default`).

Props recibidas y no usadas: `CatalogoFiltros.marcaNombre` (requerida y jamás leída) · `HistorialTab.clienteIdFiltro` (el cuerpo hace `void _clienteIdFiltro` porque el endpoint no soporta el filtro).

Ramas de página inalcanzables: el modo no-embebido de `ReportesPage.tsx:394-405` y `ReportesServicioPage.tsx:462-472` — ambas solo se montan embebidas desde Analítica y sus rutas directas son redirects.

## Backend sin consumidor — 32 endpoints

### Oportunidades de alto valor

| Endpoint | Qué habilita |
|---|---|
| `POST /api/ventas/{id}/enviar-correo` + `GET /{id}/eventos` | Envío de cotización con PDF adjunto y timeline de eventos. SMTP, registro y hasta la primitiva `timeline.tsx` están construidos; el ciclo comercial se cierra sin salir del ERP |
| `GET /api/inventario/disponibilidad/{id}` | Stock real = físico − reservas. Hoy el cotizador muestra stock crudo → se compromete material ya reservado |
| `GET/POST /api/clientes/{id}/saldo-reconciliacion` | Detecta y corrige el desfase entre el saldo cacheado y las transacciones. Sin esto, un saldo corrupto se descubre cuando el cliente reclama |
| `POST /api/ventas/{id}/ia-resumen` | Sugerencia de próximo paso comercial (Anthropic + fallback heurístico), ya integrada |
| `POST /api/ventas/{id}/whatsapp-log` | Registro del canal real que usa el equipo |
| `GET /api/inventario/movimientos` | Kardex global filtrable (hoy solo hay kardex por producto) |
| `PUT /api/compras/{id}` · `POST /{id}/recibir` | Editar una OC en borrador (hoy imposible corregir) y recibir todo en un clic (hoy el cliente recalcula deltas) |
| `GET /api/productos/exportar/csv` · `/{id}/qr` | Export de catálogo y etiquetado de almacén, listos sin botón |
| `GET /api/catalogos/marcas/{abrev}/sugerir-sku` | Autogeneración de SKU con la taxonomía de marcas; hoy se captura a mano |

### Parámetros que el backend acepta y la UI nunca manda

`marca` en productos (**el frontend filtra en cliente sobre una página de 50 → el filtro miente con catálogo grande**, y el backend ya lo resuelve) · `q` en precios · `orden_venta_id` en reportes de servicio. Al revés: `useProductosSearch.ts:120-124` envía `categoria_id`/`marca_id` que el backend ignora — **BORRAR**.

### Para borrar

`GET /api/dashboard/kpis` (legacy autodeclarado que carga la tabla de productos entera en cada request) · las 4 rutas `compras/cotizacion/{id}/*` sustituidas por el flujo de `sugerir-oc`/`generar-oc` · el alias `GET /api/compras/` · el modelo `Promocion` y sus 3 schemas (cero endpoints, cero escrituras) · 8 schemas Pydantic huérfanos (`RecordatorioOut`, `ReporteServicioResponse`, `ProductoFantasmaResponse`, `PrecioProveedorResponse`, `TransaccionCreate`, `TokenData`, `LoginRequest`) · `REMEMBER_SESSION_DAYS` (se lee y no se propaga a `Settings`) · los 4 contadores de `ClienteMergeLog` que nadie lee.

### Configuración inalcanzable

Dos claves de `platform_config` tienen lector pero **no están en `EDITABLE_KEYS`** (`app/core/runtime_config.py:11`), así que la consola de superadmin las rechaza y el valor queda fijo en su default:

- **`stock_evento_descuento`** — decide si el stock se descuenta al vender o al remisionar. Toda la lógica está implementada y probada en el dominio de remisiones. Cambiar el modelo de inventario de la empresa cuesta **añadir una clave a un set**.
- **`empresa_nombre`** — branding de PDF y Word sin redeploy.

Muertas por transitividad: las 6 variables SMTP y las 2 de Anthropic están configuradas para servicios cuya única puerta HTTP no tiene UI.

## Campos que viajan por la red y nadie lee

Confirmados contra el backend, con cero referencias fuera de su `types.ts`: métricas por etapa del pipeline · rangos `dias_min`/`dias_max` de los buckets de aging · `por_vencer_30d` de cobranza · `tiempo_estimado`/`unidad_tiempo` de servicios (ni se muestran ni se capturan) · `enviada_at`/`pdf_generado_at` de la cotización (trazabilidad de envío) · `promovido_a_producto_id` del fantasma (falta el link al producto resultante) · `fecha_recepcion` de línea de OC · `vendedor` y `cantidad_cotizada` en alertas del dashboard.

En producto: `imagen_url`, `objeto_imp` y `descripcion_fiscal` viajan en cada item de un listado de hasta 500 productos y no se renderizan — o se cablean (miniaturas, CFDI 4.0) o se sacan del schema.

## Lo que NO se encontró

Cero botones vacíos, cero `href="#"`, cero `console.log` decorativos, cero "Próximamente", cero `catch {}` vacíos, cero setters de estado muertos, cero funciones locales sin usar, cero acciones de store sin consumidor. Salvo el árbol de remisiones, no hay componentes huérfanos. **La higiene de interacción del código es notablemente buena**; la deuda está concentrada en una migración a medio terminar y en contratos que la UI nunca llegó a consumir.
