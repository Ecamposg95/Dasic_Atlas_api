// Editor híbrido de remisiones — Ola 2 del spec
// docs/superpowers/specs/2026-08-04-remision-editor-hibrido-design.md.
//
// Espejo del layout del cotizador (CotizadorPage): PageHeader + card de
// encabezado (modo Desde orden ⇄ Libre) + buscador de catálogo compartido
// (ProductSearchPanel) + carrito compartido (DocumentCartTable con caps de
// selección/entregas) + TotalsBar sticky (Guardar borrador / Emitir).
// Reemplaza a CrearRemisionPage como entrada de /spa/remisiones; el flujo de
// guardar/emitir (incluido el desglose de excesos del 400) se conserva
// idéntico al de esa página.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Truck,
  Package,
  Eye,
  EyeOff,
  History,
  ClipboardList,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Coins,
  User,
  FileStack,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { DocumentCartTable } from '@/components/document/DocumentCartTable';
import { DocumentTotalsBar } from '@/components/document/DocumentTotalsBar';
import { DocumentSectionDivider } from '@/components/document/DocumentSectionDivider';
import { ProductSearchPanel } from '@/components/document/ProductSearchPanel';
import type { DocRowCaps, DocRowCallbacks, DocRowVM } from '@/components/document/types';
import { useUnidades } from '@/features/catalogos/hooks/useUnidades';
import {
  useRemisionBorrador,
  useRemisionDetalle,
  useCrearBorrador,
  useActualizarBorrador,
  useEmitir,
} from '../hooks/useRemisiones';
import { useRemision, type RemisionLinea } from '../store';
import { remisionLineaToVM } from '../lib/vm';
import { remisionEstadoLabel, remisionEstadoTone } from '../lib/estado';
import { AgregarLineaFantasmaModal } from '../components/AgregarLineaFantasmaModal';
import { RemisionClientPicker } from '../components/RemisionClientPicker';
import { OrdenPicker } from '../components/OrdenPicker';
import { DrawerBorradoresRemision } from '../components/DrawerBorradoresRemision';
import type { EmitirErrorDetail, RemisionDetalleInput, RemisionEmitirError } from '../types';

function fmtMoney(n: number, moneda: string) {
  return `${moneda} $${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildDetallesFromLineas(lineas: RemisionLinea[]): RemisionDetalleInput[] {
  return lineas
    .filter((l) => l.incluir && l.cantidad > 0)
    .map((l) => ({
      detalle_orden_id: l.detalle_orden_id,
      descripcion: l.descripcion,
      sku: l.sku,
      cantidad: l.cantidad,
      unidad: l.unidad,
      observaciones_linea: l.observaciones_linea || null,
      clave_unidad_sat: l.clave_unidad_sat,
      precio_unitario: l.detalle_orden_id == null ? l.precio_unitario : null,
    }));
}

// Snapshot serializable de los campos que viajan al backend — usado para
// deshabilitar "Emitir" cuando hay ediciones sin guardar (mismo mecanismo
// que CrearRemisionPage: comparar snapshots en vez de auto-guardar).
function snapshotOf(state: {
  transportista: string;
  observaciones: string;
  mostrarPrecios: boolean;
  moneda: string;
  lineas: RemisionLinea[];
}): string {
  return JSON.stringify({
    transportista: state.transportista.trim(),
    observaciones: state.observaciones.trim(),
    mostrarPrecios: state.mostrarPrecios,
    moneda: state.moneda,
    detalles: buildDetallesFromLineas(state.lineas),
  });
}

type MutationErrorLike = { status?: number; detail?: string };

export function RemisionEditorPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const idParam = useParams<{ id?: string }>().id;
  const editingRouteId = idParam ? parseInt(idParam, 10) : null;

  // `?orden={id}` (deep-link desde AvanceEntregaCard / redirect de
  // /spa/remisiones-nueva?orden=) precarga esa orden vía el mismo flujo del
  // OrdenPicker. Solo aplica a documento nuevo.
  const ordenParam = params.get('orden');
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState<number | null>(() => {
    if (editingRouteId != null) return null;
    const id = ordenParam ? parseInt(ordenParam, 10) : NaN;
    return Number.isNaN(id) ? null : id;
  });

  const { data: detalleExistente, isLoading: cargandoDetalle } = useRemisionDetalle(editingRouteId);
  // Contexto de acumulados: editando → orden del detalle; nuevo → la orden
  // elegida en el picker (o el ?orden=). Nunca ambos a la vez.
  const ordenIdContexto =
    editingRouteId != null ? (detalleExistente?.orden_venta_id ?? null) : ordenSeleccionadaId;
  const { data: borrador, isLoading: cargandoBorrador } = useRemisionBorrador(ordenIdContexto);
  const { data: unidadesData } = useUnidades();

  const crear = useCrearBorrador();
  const actualizar = useActualizarBorrador();
  const emitir = useEmitir();

  const [fantasmaModal, setFantasmaModal] = useState<{
    initialSku?: string;
    initialDescripcion?: string;
  } | null>(null);
  const [drawerBorradores, setDrawerBorradores] = useState(false);
  const [avanzadasOpen, setAvanzadasOpen] = useState(false);
  const [emitError, setEmitError] = useState<EmitirErrorDetail | null>(null);
  const savedSnapshotRef = useRef<string | null>(null);

  const s = useRemision();
  const savedId = s.editingId;

  // Hidrata UNA vez por fuente (orden elegida, o borrador reabierto) — sin la
  // guarda, cada refetch de react-query pisaría ediciones locales.
  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    if (editingRouteId != null) {
      if (!detalleExistente) return;
      // Ligada a orden → esperamos también los acumulados (cotizado/
      // entregado/pendiente) para las columnas de entregas del carrito.
      if (detalleExistente.orden_venta_id != null && !borrador) return;
      const key = `edit-${editingRouteId}`;
      if (hydratedKey.current === key) return;
      useRemision.getState().hydrateFromDetalle(detalleExistente, borrador ?? null);
      hydratedKey.current = key;
      // Reabrir un borrador arranca "limpio" (sin cambios sin guardar).
      savedSnapshotRef.current = snapshotOf(useRemision.getState());
      return;
    }
    if (borrador && ordenSeleccionadaId != null) {
      const key = `orden-${ordenSeleccionadaId}`;
      if (hydratedKey.current === key) return;
      useRemision.getState().cargarOrden(borrador);
      hydratedKey.current = key;
    }
  }, [editingRouteId, detalleExistente, borrador, ordenSeleccionadaId]);
  useEffect(() => () => useRemision.getState().reset(), []);

  const opcionesUnidad = (unidadesData ?? []).filter((u) => u.activa).map((u) => u.nombre);

  // ── Guards de carga / estado (patrón CrearRemisionPage) ──────────────────
  if (editingRouteId != null) {
    if (cargandoDetalle || (detalleExistente?.orden_venta_id != null && cargandoBorrador)) {
      return <div className="p-6 text-sm text-muted-foreground/70">Cargando borrador…</div>;
    }
    if (detalleExistente && detalleExistente.estado !== 'borrador') {
      return (
        <div className="p-6 max-w-xl mx-auto text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Esta remisión ya no es un borrador (estado: {detalleExistente.estado}) — no se puede
            editar aquí.
          </p>
          <Button size="sm" onClick={() => navigate('/spa/remisiones/historial')}>
            Ir al historial
          </Button>
        </div>
      );
    }
  }

  // ── Modo orden ⇄ libre ───────────────────────────────────────────────────
  async function cambiarModo(m: 'orden' | 'libre') {
    if (s.modo === m) return;
    if (s.lineas.length > 0) {
      const ok = await confirm({
        titulo: 'Cambiar de modo',
        mensaje: 'Cambiar de modo limpia las líneas y la selección actual. ¿Continuar?',
        confirmLabel: 'Cambiar',
        tono: 'danger',
      });
      if (!ok) return;
    }
    useRemision.getState().setModo(m);
    setOrdenSeleccionadaId(null);
    hydratedKey.current = null;
    savedSnapshotRef.current = null;
    setEmitError(null);
  }

  async function quitarOrden() {
    if (s.lineas.length > 0) {
      const ok = await confirm({
        titulo: 'Quitar orden',
        mensaje: 'Quitar la orden limpia las líneas cargadas. ¿Continuar?',
        confirmLabel: 'Quitar',
        tono: 'danger',
      });
      if (!ok) return;
    }
    useRemision.getState().reset(); // initial = modo 'orden' vacío
    setOrdenSeleccionadaId(null);
    hydratedKey.current = null;
    savedSnapshotRef.current = null;
    setEmitError(null);
  }

  async function quitarClienteLibre() {
    if (s.lineas.length > 0) {
      const ok = await confirm({
        titulo: 'Cambiar cliente',
        mensaje: 'Cambiar de cliente limpia las líneas cargadas. ¿Continuar?',
        confirmLabel: 'Cambiar',
        tono: 'danger',
      });
      if (!ok) return;
    }
    // No hay acción dedicada en el store: setState directo (API pública de
    // zustand) — solo limpia cliente+líneas conservando el modo libre.
    useRemision.setState({ clienteId: null, clienteNombre: null, lineas: [] });
    savedSnapshotRef.current = null;
  }

  // ── Carrito compartido ───────────────────────────────────────────────────
  const REMISION_CAPS: DocRowCaps = {
    showCosto: false,
    showUtilidad: false,
    showDescuento: false,
    showEntrega: false,
    showImporte: s.mostrarPrecios,
    editableQty: true,
    editablePrecio: s.mostrarPrecios,
    showUnidad: true,
    unidadOptions: opcionesUnidad,
    decimalQty: true,
    seleccionable: s.modo === 'orden',
    // La sobre-entrega NO se topa en la UI (mismo criterio que el flujo
    // actual): el backend la autoriza o rechaza en /emitir con el desglose
    // de excesos. Con `false` el input quedaría topado a `pendiente` y la
    // sobre-entrega intencional (partidas ya entregadas que el usuario marca
    // a propósito) sería imposible.
    permitirExceso: true,
  };

  const rows: DocRowVM[] = s.lineas.map((l) => {
    const vm = remisionLineaToVM(l, s.moneda);
    vm.incluida = l.incluir;
    if (l.cotizado != null && l.entregado != null && l.pendiente != null) {
      vm.entregas = { cotizado: l.cotizado, entregado: l.entregado, pendiente: l.pendiente };
    }
    return vm;
  });
  const cb: DocRowCallbacks = {
    onQty: (uid, qty) => s.setQty(uid, qty),
    onRemove: (uid) => s.removeLinea(uid),
    onToggleExpand: (uid) => s.toggleExpand(uid),
    onPrecio: (uid, v) => s.setPrecio(uid, v),
    onUnidad: (uid, unidad) => s.setUnidad(uid, unidad),
    onToggleIncluir: (uid) => s.toggleIncluir(uid),
  };

  const hayLineasOrden = s.lineas.some((l) => l.detalle_orden_id != null);
  const incluidas = s.lineas.filter((l) => l.incluir && l.cantidad > 0);
  const subtotal = incluidas.reduce((acc, l) => acc + l.precio_unitario * l.cantidad, 0);

  const currentSnapshot = snapshotOf(s);
  const hasUnsavedChanges =
    savedId != null && savedSnapshotRef.current != null && savedSnapshotRef.current !== currentSnapshot;

  // ── Guardar / Emitir (idéntico a CrearRemisionPage) ──────────────────────
  function onGuardar() {
    if (s.modo === 'orden' && s.ordenId == null) {
      toast({ kind: 'warning', title: 'Selecciona una orden de venta' });
      return;
    }
    if (s.modo === 'libre' && s.clienteId == null && savedId == null) {
      toast({ kind: 'warning', title: 'Selecciona un cliente' });
      return;
    }
    if (incluidas.length === 0) {
      toast({ kind: 'warning', title: 'Incluye al menos una línea con cantidad > 0' });
      return;
    }
    if (s.modo === 'libre' && !s.moneda.trim()) {
      toast({ kind: 'warning', title: 'La moneda es obligatoria en modo libre' });
      return;
    }

    if (savedId == null) {
      crear.mutate(
        {
          orden_venta_id: s.modo === 'orden' ? s.ordenId : null,
          cliente_id: s.modo === 'libre' ? s.clienteId : null,
          moneda: s.moneda,
          transportista: s.transportista.trim() || null,
          observaciones: s.observaciones.trim() || null,
          mostrar_precios: s.mostrarPrecios,
          detalles: buildDetallesFromLineas(s.lineas),
        },
        {
          onSuccess: (r) => {
            toast({ kind: 'success', title: 'Borrador de remisión guardado' });
            useRemision.getState().setEditingId(r.id);
            savedSnapshotRef.current = currentSnapshot;
            // Ruta canónica del borrador: un refresh no pierde el draft y
            // "Emitir" queda disponible sin volver a guardar.
            navigate(`/spa/remisiones/${r.id}/editar`, { replace: true });
          },
          onError: (e) => {
            const err = e as unknown as MutationErrorLike;
            if (err.status === 401) { window.location.href = '/spa/login'; return; }
            toast({ kind: 'error', title: 'No se pudo guardar el borrador', description: err.detail });
          },
        },
      );
      return;
    }

    actualizar.mutate(
      {
        id: savedId,
        payload: {
          transportista: s.transportista.trim() || null,
          observaciones: s.observaciones.trim() || null,
          mostrar_precios: s.mostrarPrecios,
          moneda: s.moneda,
          detalles: buildDetallesFromLineas(s.lineas),
        },
      },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: 'Borrador actualizado' });
          savedSnapshotRef.current = currentSnapshot;
        },
        onError: (e) => {
          const err = e as unknown as MutationErrorLike;
          if (err.status === 401) { window.location.href = '/spa/login'; return; }
          toast({ kind: 'error', title: 'No se pudo actualizar el borrador', description: err.detail });
        },
      },
    );
  }

  async function onEmitir() {
    if (savedId == null) return;
    const ok = await confirm({
      titulo: 'Emitir remisión',
      mensaje: 'Se asignará folio y la remisión quedará inmutable. ¿Emitir?',
      confirmLabel: 'Emitir',
    });
    if (!ok) return;

    setEmitError(null);
    emitir.mutate(savedId, {
      onSuccess: (r) => {
        toast({ kind: 'success', title: `Remisión ${r.folio} emitida` });
        window.open(`/api/remisiones/${r.id}/imprimir`, '_blank');
        navigate('/spa/remisiones/historial');
      },
      onError: (e) => {
        const err = e as RemisionEmitirError;
        if (err.status === 401) { window.location.href = '/spa/login'; return; }
        if (typeof err.detail === 'object' && err.detail) {
          setEmitError(err.detail);
          toast({ kind: 'error', title: err.detail.mensaje });
        } else {
          toast({
            kind: 'error',
            title: 'No se pudo emitir',
            description: typeof err.detail === 'string' ? err.detail : undefined,
          });
        }
      },
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const cargandoOrden =
    editingRouteId == null && ordenSeleccionadaId != null && s.ordenId == null && cargandoBorrador;

  const modoBtn = (m: 'orden' | 'libre', label: string) => (
    <button
      type="button"
      onClick={() => void cambiarModo(m)}
      disabled={savedId != null}
      aria-pressed={s.modo === m}
      className={`px-3 h-8 text-xs font-medium transition first:rounded-l-md last:rounded-r-md disabled:opacity-50 disabled:cursor-not-allowed ${
        s.modo === m
          ? 'bg-accent-glow/15 text-accent-glow'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 max-w-7xl mx-auto w-full space-y-3">
        <PageHeader
          className="mb-0"
          title={
            <span className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-accent-glow" />
              {savedId != null ? 'Editar remisión' : 'Nueva remisión'}
              {s.estadoDoc && (
                <StatusBadge tone={remisionEstadoTone(s.estadoDoc)} label={remisionEstadoLabel(s.estadoDoc)} />
              )}
            </span>
          }
          actions={
            <>
              {savedId != null && (
                <span className="text-xs bg-surface-2 text-muted-foreground border border-border px-2 py-1 rounded">
                  Borrador #{savedId}
                </span>
              )}
              {/* Acciones secundarias: inline solo en md+. En móvil colapsan
                  al menú overflow "⋯" (patrón AccionesOverflowMovil). */}
              <button
                type="button"
                onClick={() => navigate('/spa/remisiones/historial')}
                className="text-[11px] px-2 py-1 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition hidden md:flex items-center gap-1"
              >
                <History className="h-3 w-3" /> Historial
              </button>
              <button
                type="button"
                onClick={() => setDrawerBorradores(true)}
                className="text-[11px] px-2 py-1 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition hidden md:flex items-center gap-1"
              >
                <ClipboardList className="h-3 w-3" /> Borradores
              </button>
              <AccionesOverflowMovil
                onHistorial={() => navigate('/spa/remisiones/historial')}
                onBorradores={() => setDrawerBorradores(true)}
              />
            </>
          }
        />

        {/* Encabezado del documento (equivalente a HeaderCotizacion) */}
        <div className="bg-card border border-border rounded-xl p-3 space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            {/* Toggle segmentado Desde orden | Libre */}
            <div className="shrink-0">
              <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
                <FileStack className="h-3 w-3" />
                Origen
              </label>
              <div
                className="inline-flex rounded-md border border-border-strong overflow-hidden"
                title={savedId != null ? 'El origen no se puede cambiar en un borrador guardado' : undefined}
              >
                {modoBtn('orden', 'Desde orden')}
                {modoBtn('libre', 'Libre')}
              </div>
            </div>

            {/* Orden (modo orden) / Cliente (modo libre) */}
            <div className="w-full min-w-0 sm:flex-1 sm:min-w-[260px]">
              <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
                <User className="h-3 w-3" />
                {s.modo === 'orden' ? 'Orden de venta' : 'Cliente'}
              </label>
              {s.modo === 'orden' ? (
                <>
                  <OrdenPicker
                    value={
                      s.ordenId != null
                        ? {
                            id: s.ordenId,
                            folio: s.ordenFolio ?? `#${s.ordenId}`,
                            cliente_nombre: s.clienteNombre,
                          }
                        : null
                    }
                    onSelect={(o) => {
                      setOrdenSeleccionadaId(o.id);
                      hydratedKey.current = null;
                    }}
                    onClear={() => void quitarOrden()}
                    disabled={savedId != null}
                  />
                  {cargandoOrden && (
                    <div className="text-[11px] text-muted-foreground mt-1">Cargando orden…</div>
                  )}
                </>
              ) : s.clienteNombre ? (
                <div className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-border-strong rounded-md bg-card">
                  <span className="text-sm text-foreground truncate">{s.clienteNombre}</span>
                  {savedId == null && (
                    <button
                      type="button"
                      onClick={() => void quitarClienteLibre()}
                      aria-label="Quitar cliente"
                      className="shrink-0 text-muted-foreground hover:text-rose-400 transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <RemisionClientPicker
                  onPick={(c) => {
                    useRemision.getState().hydrateLibre({ id: c.id, nombre: c.nombre_empresa });
                    savedSnapshotRef.current = null;
                  }}
                />
              )}
            </div>

            {/* Moneda: editable solo en modo libre. */}
            <div className="w-full sm:w-[110px] sm:shrink-0">
              <label className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground mb-1 flex items-center gap-1.5">
                <Coins className="h-3 w-3" />
                Moneda
              </label>
              {s.modo === 'libre' ? (
                <select
                  value={s.moneda}
                  onChange={(e) => s.setMoneda(e.target.value)}
                  className="w-full h-8 rounded-md border border-border-strong bg-card px-2 text-xs focus:border-accent-glow focus:ring-2 focus:ring-accent-glow/40 outline-none"
                >
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                </select>
              ) : (
                <div className="h-8 flex items-center px-2 text-xs text-muted-foreground border border-border rounded-md bg-surface-2/40">
                  {s.moneda}
                </div>
              )}
              <button
                type="button"
                onClick={() => setAvanzadasOpen((v) => !v)}
                aria-expanded={avanzadasOpen}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 whitespace-nowrap"
              >
                {avanzadasOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Avanzadas
              </button>
            </div>

            {/* Precios visibles */}
            <div className="shrink-0 sm:self-end sm:pb-1">
              <button
                type="button"
                onClick={() => s.setMostrarPrecios(!s.mostrarPrecios)}
                className="text-[11px] px-2 py-1 h-8 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition flex items-center gap-1"
              >
                {s.mostrarPrecios ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {s.mostrarPrecios ? 'Precios visibles' : 'Precios ocultos'}
              </button>
            </div>
          </div>

          {/* Avanzadas: transportista + observaciones (campos del payload). */}
          {avanzadasOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Transportista</label>
                <Input
                  value={s.transportista}
                  onChange={(e) => s.setTransportista(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Observaciones generales</label>
                <Input
                  value={s.observaciones}
                  onChange={(e) => s.setObservaciones(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        <DocumentSectionDivider icon={<Package className="h-3 w-3" />} label="Productos" />
        <ProductSearchPanel
          onAddProducto={(p, qty) => s.addProductoCatalogo(p, qty)}
          onAddServicio={(svc, qty) => s.addServicio(svc, qty)}
          onAddFantasma={(f, qty) => s.addFantasma(f, qty)}
          onOpenAddFantasma={(initial) => setFantasmaModal(initial)}
        />

        {s.modo === 'orden' && hayLineasOrden && (
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={s.seleccionarTodasPartidas}>
              Seleccionar todas
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={s.limpiarSeleccionPartidas}>
              Limpiar
            </Button>
          </div>
        )}

        <DocumentCartTable
          rows={rows}
          caps={REMISION_CAPS}
          cb={cb}
          emptyHint={
            <div className="text-xs text-muted-foreground bg-card border border-border rounded-xl p-4 text-center">
              {s.modo === 'orden' && s.ordenId == null
                ? 'Selecciona una orden de venta para cargar sus partidas, o agrega líneas desde el buscador.'
                : 'Sin líneas — agrega productos, servicios o fantasmas desde el buscador.'}
            </div>
          }
        />
      </div>

      <DocumentTotalsBar
        warnings={
          emitError && (
            <div className="mb-2 rounded-md border border-amber-700/50 bg-amber-900/20 p-3 text-xs text-amber-200 space-y-1">
              <div className="font-semibold">{emitError.mensaje}</div>
              <ul className="list-disc list-inside space-y-0.5">
                {emitError.excesos.map((x) => {
                  const linea = s.lineas.find((l) => l.detalle_orden_id === x.detalle_orden_id);
                  return (
                    <li key={x.detalle_orden_id}>
                      {linea?.descripcion ?? `Partida #${x.detalle_orden_id}`}: cotizado {x.cotizado}, pendiente{' '}
                      {x.pendiente}, solicitado {x.solicitado}
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        }
        stats={
          s.mostrarPrecios
            ? [{ label: 'Subtotal', value: fmtMoney(subtotal, s.moneda), emphasis: 'big' }]
            : [{ label: 'Líneas', value: String(incluidas.length), emphasis: 'big' }]
        }
        actions={
          <>
            <Button size="sm" variant="outline" onClick={onGuardar} disabled={crear.isPending || actualizar.isPending}>
              {crear.isPending || actualizar.isPending ? 'Guardando…' : 'Guardar borrador'}
            </Button>
            <Button
              size="sm"
              onClick={onEmitir}
              disabled={savedId == null || emitir.isPending || hasUnsavedChanges}
              title={
                savedId == null
                  ? 'Guarda el borrador antes de emitir'
                  : hasUnsavedChanges
                    ? 'Tienes cambios sin guardar — guarda el borrador antes de emitir'
                    : undefined
              }
            >
              {emitir.isPending ? 'Emitiendo…' : 'Emitir'}
            </Button>
          </>
        }
      />

      <DrawerBorradoresRemision
        open={drawerBorradores}
        onClose={() => setDrawerBorradores(false)}
        onOpen={(id) => {
          setDrawerBorradores(false);
          navigate(`/spa/remisiones/${id}/editar`);
        }}
      />

      {/* Montado condicional: cada apertura toma el prefill del buscador. */}
      {fantasmaModal && (
        <AgregarLineaFantasmaModal
          open
          initialSku={fantasmaModal.initialSku}
          initialDescripcion={fantasmaModal.initialDescripcion}
          onClose={() => setFantasmaModal(null)}
          onAdd={(linea) =>
            useRemision.getState().addFantasmaManual({
              descripcion: linea.descripcion,
              sku: linea.sku,
              precio_unitario: linea.precio_unitario,
              clave_unidad_sat: linea.clave_unidad_sat,
              cantidad: linea.cantidad,
            })
          }
        />
      )}
    </div>
  );
}

/**
 * Menú overflow "⋯" del header en móvil (< md) — mismo patrón que el
 * AccionesOverflowMovil de CotizadorPage (overlay fixed para click-fuera +
 * cierre por Escape). Agrupa Historial y Borradores, que en md+ van inline.
 */
function AccionesOverflowMovil({
  onHistorial,
  onBorradores,
}: {
  onHistorial: () => void;
  onBorradores: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const itemClass =
    'w-full text-left text-xs px-3 py-2 min-h-[40px] hover:bg-surface-2/60 text-foreground flex items-center gap-2';

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más acciones"
        className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded border border-border-strong text-foreground hover:border-accent-glow hover:text-accent-glow transition"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[180px] text-left">
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onHistorial();
                setOpen(false);
              }}
            >
              <History className="h-3.5 w-3.5" /> Historial
            </button>
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onBorradores();
                setOpen(false);
              }}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Borradores
            </button>
          </div>
        </>
      )}
    </div>
  );
}
