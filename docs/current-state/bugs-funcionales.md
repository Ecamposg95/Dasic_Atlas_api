# Bugs funcionales — agosto 2026

> Cada hallazgo tiene ruta de reproducción verificada leyendo el código. Contexto de caché: `web/src/lib/queryClient.ts` fija `staleTime: 30_000` y `refetchOnWindowFocus: false` — una query que no se invalida **no se refresca sola**.

## Top 15 por severidad

| # | Sev | Dónde | Qué pasa |
|---|---|---|---|
| ~~1~~ | ~~CRÍTICO~~ | `remisiones/hooks/useRemisiones.ts` | ✅ **Corregido** (Ola 1). Las mutaciones no invalidaban `['remision-borrador']` → el editor precargaba pendientes pre-emisión → sobre-entrega o 400 |
| ~~2~~ | ~~CRÍTICO~~ | ídem | ✅ **Corregido** (Ola 1). Tampoco invalidaban `['ventas','avance-entrega']` → el avance de la venta nunca se refrescaba tras emitir |
| ~~3~~ | ~~ALTO~~ | `cotizador/hooks/useSugerirOC.ts` | ✅ **Corregido** (Ola 1). Invalidaba `['compras']`, key inexistente; la real es `['ordenesCompra']` → las OC generadas no aparecían |
| ~~4~~ | ~~ALTO~~ | `compras/hooks/useRecibirParcial.ts` | ✅ **Corregido** (Ola 1). Recibir OC mueve stock y no invalidaba `['productos']`/`['cardex']` |
| ~~5~~ | ~~ALTO~~ | `fx/pages/FxPage.tsx` | ✅ **Corregido** (Ola 1). Override/refresh de TC no invalidaba `['fx','usd-mxn']` → el cotizador sembraba el TC viejo |
| ~~6~~ | ~~ALTO~~ | `components/layout/Sidebar.tsx` | ✅ **Corregido** (Ola 1). `modulos_visibles` se ignoraba → menús que el backend rechaza con 403. Los ítems sin clasificar en la matriz siguen visibles a propósito: cubre 11 de 21 módulos |
| 7 | ALTO | `cotizador/pages/CotizadorPage.tsx:210-212` | Cada refetch re-hidrata el carrito: pisa ediciones en vuelo y colapsa filas expandidas al guardar |
| ~~8~~ | ~~ALTO~~ | `clientes/hooks/useEmpresaDetalle.ts` | ✅ **Corregido** (Ola 1). Registrar pago no invalidaba `['empresa',id,'resumen']` → saldo viejo en la pestaña contigua |
| ~~9~~ | ~~ALTO~~ | `cxc/hooks/usePagoDistribuido.ts` | ✅ **Corregido** (Ola 1). Espejo del anterior. Ambos usan ahora el helper compartido `lib/cobranza-cache.ts`, porque el bug era la enumeración duplicada de claves |
| ~~10~~ | ~~ALTO~~ | `remisiones/pages/RemisionesPage.tsx` | ✅ **Corregido** (Ola 1). Recibir/Cancelar/Crear cotización eran visibles para roles que el backend rechaza. Ahora leen los flags `can_*` que `/api/auth/me` ya entregaba |
| ~~11~~ | ~~ALTO~~ | `servicios/pages/ServiciosPage.tsx` | ✅ **Corregido** (Ola 1). Comparaciones de rol a mano sin `'superadmin'`. Sustituidas por los helpers centrales, espejo de las guardas del router |
| ~~12~~ | ~~ALTO~~ | `borradores/pages/BorradoresPage.tsx` | ✅ **Corregido** (Ola 1). Dos query keys para el mismo endpoint → descartar en una pantalla dejaba fantasmas en la otra. Se invalidan ambas; unificar los dos hooks queda pendiente |
| ~~13~~ | ~~MEDIO~~ | `cotizador/store.ts` + `routers/ventas.py` | ✅ **Corregido** (Ola 1). `max: 0` al re-hidratar → toda cotización guardada mostraba "Sin stock · OC". La causa estaba en el backend: `/detalle-json` no exponía `stock_actual` |
| 14 | MEDIO | `components/document/DocumentRow.tsx:186-196,479-487` | El input de cantidad se autocorrige en cada tecla; no se puede vaciar para reteclear |
| ~~15~~ | ~~MEDIO~~ | `cotizador/components/HeaderCotizacion.tsx`, `fx/pages/FxPage.tsx` | ✅ **Corregido** (Ola 1). `toISOString()` usaba UTC: tras las 18:00 CDMX los documentos nacían fechados un día adelante. Helper `lib/fechas.ts` con 9 pruebas; la suite fija `TZ=America/Mexico_City` para que sean falsificables en CI |

~~**Bonus trivial:** `seguimiento/types.ts:28` — el toast de convertir a venta imprime `undefined`.~~ ✅ **Corregido** (Ola 1): el tipo declaraba `{id, folio_venta}` y el backend devuelve `{mensaje, nuevo_folio}`.

## Invalidación de caché — mapa completo

Además de los del top: ~~`useCrearCotizacionDesde` crea una orden y solo invalida remisiones~~ (✅ corregido junto con #1 y #2, igual que las invalidaciones de `['productos']`/`['cardex']` al emitir y cancelar, que sí mueven inventario); los tres flujos de `SeguimientoPage.tsx:264,277,289` (recotizar/convertir/cancelar) mueven stock y crean cargos de cobranza sin invalidar `['productos']` ni `['cxc-*']`; los ajustes de inventario (`AjusteStockModal.tsx:32`, `ProductoFormModal.tsx:60`, `useProductos.ts:85`) no invalidan `['cardex']` pese a generar movimientos; las mutaciones de CRM (`useCrmDeals.ts`) no invalidan `['empresa',id,'deals']` ni el dashboard.

**Cero invalidaciones de `['dashboard']` en toda la app** — sus alertas (cotizaciones por vencer, stock crítico, saldos vencidos, OC en borrador) pueden estar arbitrariamente viejas.

## Manejo de errores

Sin `onError` ni feedback: eliminar contacto (`ContactosTab.tsx:49`), borrar nota (`NotasTab.tsx:45`, tampoco confirma), eliminar activo y planta (`ActivosTab.tsx:51`, `PlantasTab.tsx:45` — el 409 "la planta tiene activos" se pierde en silencio).

**`Layout.tsx:35-40`**: cualquier fallo de `/api/auth/me` (500, timeout, red intermitente) expulsa al login, no solo el 401 → se pierde el trabajo en curso por un parpadeo de red. `ReportesPage.tsx:292-294` hace `window.location.href` **durante el render** y hacia `/` en vez de `/spa/login`.

## Estado obsoleto y carreras

El caso grave es el cotizador (#7 del top). Menores: efectos con `[]` que no reaccionan a cambios de query param en `CotizadorPage.tsx:230-241` (navegar de `?cliente=5` a `?cliente=9` no re-precarga) y `RemisionesPage.tsx:466-478` (un segundo `?ver=` no abre el detalle). El import de JSON del cotizador (`CotizadorPage.tsx:100-163`) sigue agregando líneas al store aunque navegues fuera.

Bien resueltos: `useMoveDeal` (cancelQueries + snapshot + rollback) y la guarda contra doble POST de `useGuardarCotizacion`.

## Validación cliente vs servidor

`GastoFormModal.tsx:34-42` no limita la categoría a 80 caracteres (el backend sí) → 422 con mensaje crudo de Pydantic. `AjusteStockModal.tsx:61-64` valida motivo no vacío donde el backend puede exigir 3 caracteres, y su mensaje de 403 menciona un rol equivocado.

## Navegación

`DealCard.tsx:90-91` enlaza a `/spa/seguimiento?orden=<id>` pero **esa página nunca lee query params** → abre el historial completo sin filtrar, y con recarga dura por ser `<a target="_blank">`. `TotalsBar.tsx:220` ("Guardar e ir a Seguimiento") usa una ruta legacy cuyo redirect **descarta el query string**, además de recargar toda la SPA; el "Cancelar" de `:79,84` recarga igual y se salta la confirmación cuando hay una cotización en edición.

## Permisos: UI vs matriz del backend

Falsos positivos (se muestra y el backend rechaza): menú completo para Ventas y Operativo (#6), acciones de remisión (#10).

~~Falsos negativos~~ ✅ **Corregidos** (Ola 1). Servicios (#11) e Inventario. En inventario el hallazgo real difería del reportado: la columna de costo desalineaba **en ambos sentidos** —el backend excluía a `SUPERADMIN` de ver costos, porque `RolUsuario.ADMIN` es alias de `ADMINISTRADOR` y no un tier que lo incluya, mientras la UI se la escondía a gerencia— y el botón de **ajustar stock no tenía gateo alguno**, así que ventas y operativo lo veían y recibían 403. Corregidos los tres puntos, backend incluido.

**Contradicción de la propia matriz:** `permissions.py:249-257` declara el módulo `compras` visible para Ventas y Operativo, pero los 11 endpoints de compras exigen admin o gerencia. O se alinea la matriz, o se alinean los endpoints.

## Lo que se verificó y está limpio

`lib/calc.ts` (defensivo en conversiones, banda de plausibilidad del TC, redondeo por línea antes de sumar) · protección contra doble submit en todos los formularios · todos los literales `/spa/...` del código existen en el router · los decimales llegan como número, no como string.
