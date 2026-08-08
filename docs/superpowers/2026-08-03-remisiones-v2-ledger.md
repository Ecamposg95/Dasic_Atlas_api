# SDD ledger — plan: /mnt/d/Devs/dasic-atlas-api/docs/superpowers/plans/2026-08-03-remisiones-v2.md

Worktree: /mnt/d/Devs/dasic-atlas-api/.worktrees/remisiones-v2 (rama feat/remisiones-v2, base main@014909d)
Python: .venv/bin/python (uv, stack completo + pytest instalado)
Task 1: fix round 1/5 (2 addressed, 0 open — TolerantEnum revertido, session.py revertido; commits d5722e5..9245169)
Task 1: complete (commits 014909d..9245169, review clean tras fix round 1)
Task 2: complete (commits 9245169..e76a705, review clean)
Task 2: minor (deferred): LIKE sin escapar prefijo en folio_service (asimetría con re.escape) — anotar antes de generalizar a otros prefijos
Task 2: minor (deferred): datetime.utcnow() deprecado en folio_service (heredado del plan); parámetro `modelo` sin uso en el cuerpo
Task 3: fix round 1/5 (2 addressed, 0 open — casing UPPER en 3 vías + import al bloque; commits 24cb911..37a234d)
Task 3: complete (commits e76a705..37a234d, review clean tras fix round 1)
Nota: migración encadena de 20260804_01 (deal_detalle, ya en la base de la rama) — dato del plan quedó viejo, adjudicado correcto
Task 4: implementado (28199db); concern correctness Decimal->Integer stock en ventas.py — fix pre-review despachado
Task 4: pendiente frontend (para Task 9/11): useUnidades.ts y UnidadesTab.tsx esperan shape viejo de /catalogos/unidades; inputs con parseInt sin step en DocumentRow.tsx:142,397 y AgregarFantasmaModal.tsx:116
Task 4: fix pre-review (b39fa60 guard Decimal->int stock en ventas.py, helper cantidad_entera_para_stock + 3 tests)
Task 4: fix round 1/5 (3 addressed — unidad persistida en 3 constructores, index id migración, 409 editar_unidad; commits b39fa60..a184bf2)
Task 4: complete (commits 37a234d..a184bf2, review clean)
Task 4: minor (deferred): falta test automatizado del fallback payload/catálogo de unidad en crear_orden/actualizar_orden (verificado manual con TestClient; clone sí tiene test)
Task 5: complete (commits a184bf2..b0d9a54, review clean a la primera; TolerantEnum .in_() y Decimal SUM verificados empíricos)
Task 5: minor (deferred): filtro q de listar sin test directo (reviewer lo ejercitó manual); mezcla truthy/is-not-None heredada del plan
Task 6: implementado (3a0527e); review opus: 2 Critical (TOCTOU emitir, doble cancelar) + 3 Important + minors — fix round 1 despachado
Task 6: parked: conversión repetible sin guard (permitido a propósito, N cotizaciones de una remisión es caso de negocio válido); stock_descontado no se resetea al cancelar (registro histórico; re-check de estado bloquea doble reversa)
Task 6: fix round 1/5 (12 addressed, 4 rupturas nuevas — ObjectDeletedError 500, producto_id corrompe stock aguas abajo, recepcion sin guard, servicios pierden clasificacion; commits 3a0527e..c839a00)
Task 6: fix round 2/5 despachado (A wrap refresh+lock eliminar_borrador, B revertir producto_id/preservar servicios, C guard recepcion, D test spy refresh)
Task 6: fix round 2/5 (4 addressed — _refresh_or_404, conversion sin producto_id + servicios preservados, guard recepcion, spy test; commits c839a00..95d3bc5; sin rupturas bloqueantes)
Task 6: fix round 3/5 despachado (actualizar_borrador lock/refresh/re-check, catch estrecho ObjectDeletedError, test happy path eliminar_borrador)
Task 6: fix round 3/5 (3 addressed — actualizar_borrador con lock, catch estrecho exacto, happy path test; commits 95d3bc5..5d23ddb)
Task 6: complete (commits b0d9a54..5d23ddb, review clean tras 3 rounds; 31 tests)
Task 7: implementado (6a1f4a2); matriz + router v2 + avance-entrega en ventas.py; 43 tests (12 nuevos). Ver task-7-report.md — concerns: repository.listar() tocado fuera de la lista de archivos del brief (estado acepta iterable), GET /{id}/word/imprimir agregados sin estar en el contrato explícito, recepcion cambia de query param a body (rompe frontend viejo hasta Tasks 9-11).
Task 7: implementado (6a1f4a2); review opus pentest: 2 Important (word/imprimir bypass OPERATIVO, avance-entrega sin gate) + decision producto #3 — fix round 1 despachado
Task 7: ADJUDICADO #3: VENTAS puede crear remision sobre orden ajena (cartera compartida B2B); visibilidad read:own ampliada a "propias O de ordenes propias"; mutaciones estrictas a creado_por_id. Confirmar con Emmanuel en el reporte final.
Task 7: minor (deferred, para Tasks 9-11): frontend viejo manda ?recibida= que el GET / nuevo ignora en silencio (useRemisiones.ts:16-22, RemisionesPage.tsx:348); PATCH recepcion ahora es JSON body (useRemisiones.ts:43)
Task 7: fix round 1/? (776eeb5) — 2 Important addressed (word/imprimir ahora pasan por _check_operativo_estado; avance-entrega filtra `remisiones` por OPERATIVO/VENTAS) + decisión #3 implementada (repository.listar OR owner/orden-vendedor, _check_owner con regla ampliada solo para "read"); minors 4/5/7 addressed (estado inválido 400, comentario recepcion corregido, require() redundante en cancelar/crear-cotizacion). 50 tests (7 nuevos), sin regresiones. Ver task-7-report.md sección "Fix round 1".
Task 7: fix round 1/5 (7 addressed — gates word/imprimir/avance, visibilidad OR lectura + mutacion estricta, 400 estado, requires redundantes; commits 6a1f4a2..776eeb5)
Task 7: complete (commits 5d23ddb..776eeb5, review clean tras fix round 1; 50 tests)
Task 8: implementado (8c59888); review: ALTO autoescape faltante (XSS almacenado en /imprimir) + MEDIO default duplicado — fix round 1 despachado
Task 8: nota: XSS mismo patrón preexistente en compras.py:833, clientes.py:913, ventas.py:1740 (fuera de alcance del sprint — anotar para deuda)
Task 8: fix round 1/5 (2 addressed — autoescape select_autoescape + param requerido; commits 8c59888..6e01216)
Task 8: complete (commits 776eeb5..6e01216, review clean tras fix round 1; 56 tests)
Task 9: complete (commits 6e01216..e346cf3, review clean a la primera; tsc limpio)
Task 9: para Task 10: (1) tipar/mostrar el 400 estructurado {mensaje, excesos} de sobre-entrega (normalizeDetail no desempaqueta 'mensaje'); (2) RenombrarModal de UnidadesTab apunta al rename legacy — silent no-op; (3) cantidad_max del store usa cantidad_orden, el editor debe usar cantidad_pendiente
Task 10: complete (commits e346cf3..eeede77, review clean a la primera; tsc + build limpios)
Task 10: minor (deferred, para Task 11): Emitir no fuerza guardar diffs pendientes (deshabilitar con cambios sin guardar); min=0.001 vs piso 0 en onChange; editor sin affordance de eliminar borrador
Task 11: implementado (5aefa88); review: 1 medium en alcance (AvanceEntregaCard sin error handling) — fix round 1 despachado
Task 11: ticket futuro (repo-wide, NO de este sprint): gating de botones por capabilities de /api/me — ninguna página del frontend consume los flags can_*; OPERATIVO ve botones que le darán 403 (el backend sí protege). Candidato a Bloque siguiente.
Task 11: fix round 1/5 (3 addressed — error handling avance, botón cancelar, dedupe; commits 5aefa88..5cc9158)
Task 11: complete (commits eeede77..5cc9158, review clean tras fix round 1)
Task 12: complete (d1e96d6 solo dist regenerado — verificado por el controlador: cero archivos fuera de app/static/dist; QA doc local con 12 casos)
FINAL: review de rama (fable): Mergeable tras ola final. Ola final bd34131+ba3c977+c1ffd82 (I-1 GC recibir, I-2 RenombrarModal, M-1 schemas huerfano, M-2 contacto, M-3 template NULL, 2 tests stock §8) — re-review clean, 61 tests.
FINAL: quedan para refinement con DASIC: M-5 (convertir:own de VENTAS vs spec sin :own), conversion repetible, visibilidad VENTAS ampliada (ratificacion Emmanuel), M-4 documentado en QA.
