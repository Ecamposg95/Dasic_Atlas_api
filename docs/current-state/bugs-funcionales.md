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
| 7 | **PARCIAL** | `cotizador/pages/CotizadorPage.tsx:210-212` | ✅ Ya no colapsa las filas expandidas al guardar (`store.ts` conserva `expandedUids` al re-hidratar la misma orden). ⚠️ **Sigue abierto**: un refetch que aterrice mientras se teclea pisa la edición en vuelo. Requiere marcar el estado como sucio y decidir qué gana — el servidor o lo que el usuario está escribiendo—, que es decisión de producto |
| ~~8~~ | ~~ALTO~~ | `clientes/hooks/useEmpresaDetalle.ts` | ✅ **Corregido** (Ola 1). Registrar pago no invalidaba `['empresa',id,'resumen']` → saldo viejo en la pestaña contigua |
| ~~9~~ | ~~ALTO~~ | `cxc/hooks/usePagoDistribuido.ts` | ✅ **Corregido** (Ola 1). Espejo del anterior. Ambos usan ahora el helper compartido `lib/cobranza-cache.ts`, porque el bug era la enumeración duplicada de claves |
| ~~10~~ | ~~ALTO~~ | `remisiones/pages/RemisionesPage.tsx` | ✅ **Corregido** (Ola 1). Recibir/Cancelar/Crear cotización eran visibles para roles que el backend rechaza. Ahora leen los flags `can_*` que `/api/auth/me` ya entregaba |
| ~~11~~ | ~~ALTO~~ | `servicios/pages/ServiciosPage.tsx` | ✅ **Corregido** (Ola 1). Comparaciones de rol a mano sin `'superadmin'`. Sustituidas por los helpers centrales, espejo de las guardas del router |
| ~~12~~ | ~~ALTO~~ | `borradores/pages/BorradoresPage.tsx` | ✅ **Corregido** (Ola 1). Dos query keys para el mismo endpoint → descartar en una pantalla dejaba fantasmas en la otra. Se invalidan ambas; unificar los dos hooks queda pendiente |
| ~~13~~ | ~~MEDIO~~ | `cotizador/store.ts` + `routers/ventas.py` | ✅ **Corregido** (Ola 1). `max: 0` al re-hidratar → toda cotización guardada mostraba "Sin stock · OC". La causa estaba en el backend: `/detalle-json` no exponía `stock_actual` |
| ~~14~~ | ~~MEDIO~~ | `components/document/DocumentRow.tsx` | ✅ **Corregido** (Ola 1). El input de cantidad se autocorregía en cada tecla y no se podía vaciar para reteclear. Lógica extraída a `useQtyDraft` (compartida por tabla y tarjeta, donde estaba duplicada) con 12 pruebas |
| ~~15~~ | ~~MEDIO~~ | `cotizador/components/HeaderCotizacion.tsx`, `fx/pages/FxPage.tsx` | ✅ **Corregido** (Ola 1). `toISOString()` usaba UTC: tras las 18:00 CDMX los documentos nacían fechados un día adelante. Helper `lib/fechas.ts` con 9 pruebas; la suite fija `TZ=America/Mexico_City` para que sean falsificables en CI |

~~**Bonus trivial:** `seguimiento/types.ts:28` — el toast de convertir a venta imprime `undefined`.~~ ✅ **Corregido** (Ola 1): el tipo declaraba `{id, folio_venta}` y el backend devuelve `{mensaje, nuevo_folio}`.

## Invalidación de caché — mapa completo

Además de los del top: ~~`useCrearCotizacionDesde` crea una orden y solo invalida remisiones~~ (✅ corregido junto con #1 y #2, igual que las invalidaciones de `['productos']`/`['cardex']` al emitir y cancelar, que sí mueven inventario); ✅ **Corregidos** (P3), con dos precisiones sobre el reporte. De los tres flujos de `SeguimientoPage` **solo dos** tienen efectos: `convertir` consume las reservas a SALIDA y crea el cargo de cobranza, y `cancelar` libera reservas — **`recotizar` no toca ni stock ni cobranza**, así que su invalidación ya era correcta. Los ajustes de inventario y la importación masiva ya invalidan `['cardex']`. Pendiente: las mutaciones de CRM y `['empresa',id,'deals']`.

✅ **Corregido, y el diagnóstico era otro.** Es cierto que nadie invalida `['dashboard']`, pero con `refetchOnMount` por defecto el dashboard **sí** se refresca al navegar a él: el máximo desfase al entrar era su `staleTime`. El fallo real estaba en el otro lado — es la pantalla que la gente **deja abierta**, y el default global apaga `refetchOnWindowFocus` (correcto en pantallas de edición, donde un refetch pisaría lo que se captura, pero aquí no hay nada que pisar). Sus 6 consultas lo activan ahora. Se prefirió eso a salpicar invalidaciones en 20 sitios, que es justo el patrón que se desincroniza.

## Manejo de errores

~~Sin `onError` ni feedback~~ ✅ **Corregido, y de los cuatro reportados solo dos eran reales.** Eliminar contacto y borrar nota no tenían `onError`: ya lo tienen, y el borrado de nota ahora **confirma** (era el único borrado del sistema que no preguntaba, frente a 43 sitios que sí). **Activo y planta ya estaban resueltos:** su `onError` con toast vive en el hook `useInstalaciones.ts`, no en el componente que revisó la auditoría — el 409 "la planta tiene activos" nunca se perdió.

~~**`Layout.tsx:35-40`**~~ ✅ **Corregido.** Cualquier fallo de `/api/auth/me` expulsaba al login, no solo el 401. Ahora solo 401 y 403 sacan al usuario; lo transitorio se reintenta 3 veces con espera creciente y, si no cede, se muestra una pantalla con "Reintentar" en vez de echarlo. **Matiz sobre el reporte original:** el efecto solo corre con `user === null` —al recargar o entrar por enlace directo—, así que no había pérdida de trabajo en curso; el daño real era aterrizar en el login en vez de en la ruta pedida.

~~`ReportesPage.tsx:292-294`~~ ✅ **Corregido.** Hacía `window.location.href` **durante el render** (efecto secundario en fase de render, que React puede ejecutar dos veces) y recargaba la SPA entera; ahora usa `<Navigate>`.

✅ **Hallazgo adicional, no auditado:** los **47** sitios que redirigen a `/spa/login` resolvían a una ruta **hija de `/spa`**, cuyo elemento es el `Layout` protegido: el login se dibujaba **dentro del shell autenticado** —sidebar, header y footer alrededor del formulario— y disparaba la verificación de sesión del propio Layout, que al recibir otro 401 navegaba a `/`. Se movió al nivel superior, donde se dibuja limpio y sin rebote, y se retiró la hija para no dejar dos rutas compitiendo por el mismo path.

🔵 **En curso — estado de error por página.** Se creó `components/ui/query-error.tsx`: dos formas (bloque suelto y `<tr>` con `asRow`, porque los listados renderizan dentro de un `<tbody>` donde no cabe un `<div>`), y trata el **403 aparte** —lo presenta como falta de acceso y sin botón de reintentar, porque no es un fallo sino una respuesta—. Adoptada en servicios, contactos, borradores, usuarios, gastos, inventario, clientes y compras. **Cobertura: 11 de 35 páginas** (antes 3). La rama de error va siempre antes que la de vacío: confundir "roto" con "vacío" es justo el defecto que corrige.

## Estado obsoleto y carreras

El caso grave es el cotizador (#7 del top). Menores: efectos con `[]` que no reaccionan a cambios de query param en `CotizadorPage.tsx:230-241` (navegar de `?cliente=5` a `?cliente=9` no re-precarga) y `RemisionesPage.tsx:466-478` (un segundo `?ver=` no abre el detalle). El import de JSON del cotizador (`CotizadorPage.tsx:100-163`) sigue agregando líneas al store aunque navegues fuera.

Bien resueltos: `useMoveDeal` (cancelQueries + snapshot + rollback) y la guarda contra doble POST de `useGuardarCotizacion`.

## Validación cliente vs servidor

`GastoFormModal.tsx:34-42` no limita la categoría a 80 caracteres (el backend sí) → 422 con mensaje crudo de Pydantic. `AjusteStockModal.tsx:61-64` valida motivo no vacío donde el backend puede exigir 3 caracteres, y su mensaje de 403 menciona un rol equivocado.

## Navegación

✅ **Corregido.** `SeguimientoPage` ya siembra su búsqueda desde `?folio=` y `?orden=`, así que el enlace de `DealCard` y el "Guardar e ir a Seguimiento" del cotizador abren filtrados en vez del historial completo. `TotalsBar` navega del lado del cliente a la ruta canónica `/spa/seguimiento` —sus tres salidas recargaban la SPA entera— y la ruta legacy `/seguimiento` pasó a usar `RedirectConQuery`, el helper que ya existía en el router, para no descartar el query string. **Pendiente:** el "Cancelar" sigue saltándose la confirmación cuando hay una cotización en edición.

## Permisos: UI vs matriz del backend

Falsos positivos (se muestra y el backend rechaza): menú completo para Ventas y Operativo (#6), acciones de remisión (#10).

~~Falsos negativos~~ ✅ **Corregidos** (Ola 1). Servicios (#11) e Inventario. En inventario el hallazgo real difería del reportado: la columna de costo desalineaba **en ambos sentidos** —el backend excluía a `SUPERADMIN` de ver costos, porque `RolUsuario.ADMIN` es alias de `ADMINISTRADOR` y no un tier que lo incluya, mientras la UI se la escondía a gerencia— y el botón de **ajustar stock no tenía gateo alguno**, así que ventas y operativo lo veían y recibían 403. Corregidos los tres puntos, backend incluido.

**Contradicción de la propia matriz:** `permissions.py:249-257` declara el módulo `compras` visible para Ventas y Operativo, pero los 11 endpoints de compras exigen admin o gerencia. O se alinea la matriz, o se alinean los endpoints.

## Lo que se verificó y está limpio

`lib/calc.ts` (defensivo en conversiones, banda de plausibilidad del TC, redondeo por línea antes de sumar) · protección contra doble submit en todos los formularios · todos los literales `/spa/...` del código existen en el router · los decimales llegan como número, no como string.
