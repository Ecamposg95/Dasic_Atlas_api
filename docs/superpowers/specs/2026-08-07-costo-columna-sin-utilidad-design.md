# Columna COSTO del cotizador: costo convertido, sin utilidad

**Fecha:** 2026-08-07
**Estado:** Diseño aprobado
**Alcance:** Solo presentación del carrito del cotizador. Sin backend, sin esquema, sin cambio de cálculo.

## Problema

La columna `$ COSTO` del carrito muestra hoy el **precio unitario de venta** —
costo del material convertido a la moneda del documento **y ya multiplicado por
la utilidad de la línea**. En la fila del ejemplo (`ACT200-42L-S`, USD→MXN):

```
  Orig USD $205.80
  $4,998.67  PU        ← 205.80 × 18.2211 × 1.333
```

Eso hace que la columna diga dos cosas a la vez (costo *y* margen) y que la fila
sea imposible de auditar de un vistazo: `COSTO` coincide numéricamente con
`IMPORTE` cuando la cantidad es 1, y la columna `% UTIL` parece no tener efecto
en ningún lado. El usuario pide que en ese apartado aparezca **solo la operación
del precio unitario del material por el tipo de cambio, sin utilidad alguna.**

## Estado actual del código (verificado)

- `web/src/features/cotizador/components/Cart.tsx:50-52` — el adaptador computa
  `costoOc: convertCost(...) * (1 + utilidad / 100)`.
- `web/src/components/document/DocumentRow.tsx:229-235` — fila desktop; imprime
  `${fmt(vm.costoOc)}` con el sufijo `PU` y un `title` que documenta la fórmula
  con utilidad.
- `web/src/components/document/DocumentRow.tsx:532-542` — card móvil; imprime la
  misma cifra con el prefijo `PU:`.
- `web/src/components/document/types.ts:52-54` — el contrato del campo `costoOc`
  documenta explícitamente "PU = costo convertido × (1+util)".
- `web/src/features/cotizador/lib/calc.ts::convertCost` — ya hace exactamente la
  conversión requerida (costo × TC direccional, sin utilidad) y está cubierto por
  tests.

**Origen del comportamiento actual:** commit `c15b8ad` (2026-06-10), punto 1 —
"columna COSTO muestra PU", pedido sobre la cotización C-2606019
(Ing. Rafael Hernández / DASIC). Antes de ese commit la columna mostraba justo lo
que se pide ahora. Los puntos 2 y 3 de aquel commit (tasa de venta única y header
TC de 2 celdas) **no** se tocan aquí; el punto 2 ya fue sustituido por el modelo
direccional del 2026-08-04.

## Decisiones

### 1. Tipo de cambio: el de VENTA (DOF ± tolerancia), no el DOF puro

La cifra es `convertCost(costo_origen, moneda_origen, moneda_documento, tcs)`:

- USD → MXN: `costo × (DOF + tolerancia)`
- MXN → USD: `costo ÷ (DOF − tolerancia)`

Es decir, el spread cambiario **sigue incluido**. Razones:

- Mantiene la fila aritméticamente cerrada (ver §2), que es el objetivo real.
- El costo a DOF puro ya existe y tiene su lugar propio: el detalle expandido
  (`RowExpanded`) muestra "Costo OC (DOF)" con el descuento de proveedor
  aplicado. Duplicarlo en la columna crearía dos cifras rivales para el mismo
  concepto.

Descartado: mostrar DOF puro en la columna (rompe la reconstrucción del importe y
esconde el spread), y mostrar ambas cifras (celda de 3 renglones que compite con
el detalle expandido).

### 2. Consecuencia buscada: la fila se puede auditar leyéndola

Con el cambio, cualquier persona reconstruye el importe de izquierda a derecha:

```
COSTO 3,749.94 × (1 + 33.3 %) × CANT 1 × (1 − 0 % DESC) = IMPORTE 4,998.67
```

Esto **es** el criterio de aceptación, no un efecto colateral.

### 3. Etiqueta: la moneda del documento

`PU` deja de ser cierto, así que se sustituye por `vm.monedaDocumento` (`MXN` /
`USD`). Refuerza la lectura de la celda como conversión — `Orig USD → MXN` — sin
introducir jerga interna.

```
ANTES                          DESPUÉS
  Orig USD $205.80               Orig USD $205.80
  $4,998.67  PU                  $3,749.94  MXN
```

## Cambios

| Archivo | Cambio |
|---|---|
| `web/src/features/cotizador/components/Cart.tsx:46-52` | Quitar `* (1 + Number(item.utilidad) / 100)` de `costoOc`; queda `convertCost(...)`. Reescribir el comentario que documenta la columna. |
| `web/src/components/document/DocumentRow.tsx:229-235` | Fila desktop: sufijo `PU` → `{vm.monedaDocumento}`; `title` reescrito a la fórmula sin utilidad. |
| `web/src/components/document/DocumentRow.tsx:532-542` | Card móvil: prefijo `PU:` → `Costo:`, con la moneda del documento junto a la cifra. |
| `web/src/components/document/types.ts:52-54` | Contrato de `costoOc` actualizado: costo unitario convertido al TC de venta, sin utilidad ni descuento. |
| `web/src/features/cotizador/lib/calc.test.ts` | Test nuevo del invariante de §2. |

**Fuera de alcance, verificado como no afectado:**

- `calc.ts` — `convertCost` ya es la función correcta; no se modifica.
- Backend, PDF al cliente, serialización y persistencia — el valor mostrado nunca
  se guardó; se derivaba en render.
- `RowExpanded` — "Costo OC (DOF)" sigue igual, es otro dato (DOF puro, neto de
  descuento de proveedor).
- Remisiones — `RemisionEditorPage` y `CrearRemisionPage` fijan
  `showCosto: false`, así que la celda no se renderiza ahí.
- Totales, márgenes y subtotales por moneda nativa — no leen `costoOc`.

## Pruebas

Un test nuevo en `calc.test.ts` que fija el invariante de §2: para una línea USD
en cotización MXN con utilidad y descuento, el valor que la columna muestra
(`convertCost(...)`) multiplicado por `(1 + util) × qty × (1 − desc)` debe ser
exactamente `lineImporte(...)`. Es la red que impide que la utilidad vuelva a
colarse en la columna sin que nadie lo note.

Verificación: `cd web && npm run test && npm run typecheck && npm run build`, y
commit de `app/static/dist/` (Railway no compila la SPA).

## Riesgo asumido

Revierte el punto 1 de `c15b8ad`, que puso la utilidad en esa columna por
petición de un usuario de DASIC sobre C-2606019. Si esa petición sigue vigente
para alguien más del equipo comercial, este cambio la deshace. El usuario aprobó
el cambio con ese riesgo enunciado.

Las cotizaciones históricas no requieren reparación: el cambio es de render, no
de datos.
