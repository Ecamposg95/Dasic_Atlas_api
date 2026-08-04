import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Truck, Package, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { DocumentCartTable } from '@/components/document/DocumentCartTable';
import { DocumentTotalsBar } from '@/components/document/DocumentTotalsBar';
import { DocumentSectionDivider } from '@/components/document/DocumentSectionDivider';
import type { DocRowCaps, DocRowCallbacks, DocRowVM } from '@/components/document/types';
import { useUnidades } from '@/features/catalogos/hooks/useUnidades';
import {
  useRemisionBorrador,
  useRemisionDetalle,
  useCrearBorrador,
  useActualizarBorrador,
  useEmitir,
  useOrdenesRemisionables,
} from '../hooks/useRemisiones';
import { useRemision } from '../store';
import { remisionLineaToVM } from '../lib/vm';
import { RemisionProductSearch } from '../components/RemisionProductSearch';
import { AgregarLineaFantasmaModal } from '../components/AgregarLineaFantasmaModal';
import { RemisionClientPicker } from '../components/RemisionClientPicker';
import { PartidasSeleccionTable } from '../components/PartidasSeleccionTable';
import type { EmitirErrorDetail, RemisionDetalleInput, RemisionEmitirError } from '../types';

function fmtMoney(n: number, moneda: string) {
  return `${moneda} $${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Errores de mutación tipados como el resto del repo maneja `api.*`
// ({status, detail} — ver lib/api.ts). `useEmitir` es la excepción: su
// `detail` puede ser un objeto {mensaje, excesos} (ver hooks/useRemisiones.ts).
type MutationErrorLike = { status?: number; detail?: string };

export function CrearRemisionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ordenParam = params.get('orden');
  const ordenIdNuevo = ordenParam ? parseInt(ordenParam, 10) : null;
  const libre = params.get('libre') === '1';

  const idParam = useParams<{ id?: string }>().id;
  const editingId = idParam ? parseInt(idParam, 10) : null;

  const { data: detalleExistente, isLoading: cargandoDetalle } = useRemisionDetalle(editingId);
  // Contexto de acumulados de la orden: si estamos editando un borrador ya
  // ligado a una orden, lo derivamos de `detalleExistente`; si estamos
  // creando uno nuevo, del query param `?orden=`. Nunca ambos a la vez.
  const ordenIdContexto = editingId != null ? (detalleExistente?.orden_venta_id ?? null) : ordenIdNuevo;
  const { data: borrador, isLoading: cargandoBorrador } = useRemisionBorrador(ordenIdContexto);
  const { data: ordenes } = useOrdenesRemisionables();
  const { data: unidadesData } = useUnidades();

  const crear = useCrearBorrador();
  const actualizar = useActualizarBorrador();
  const emitir = useEmitir();

  const [modalFantasma, setModalFantasma] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(editingId);
  const [emitError, setEmitError] = useState<EmitirErrorDetail | null>(null);

  const s = useRemision();

  // Hidrata UNA vez por combinación de fuente (borrador nuevo desde orden, o
  // borrador existente reabierto) — sin la guarda, cada render que trae
  // datos frescos de react-query pisaría ediciones locales del usuario.
  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    if (editingId != null) {
      if (!detalleExistente) return;
      // Si la remisión está ligada a una orden, esperamos también el
      // contexto de acumulados (cotizado/entregado/pendiente) — sin él la
      // tabla de selección de partidas no tendría con qué mostrarse.
      if (detalleExistente.orden_venta_id != null && !borrador) return;
      const key = `edit-${editingId}`;
      if (hydratedKey.current === key) return;
      useRemision.getState().hydrateFromDetalle(detalleExistente, borrador ?? null);
      hydratedKey.current = key;
      return;
    }
    if (borrador && ordenIdNuevo != null) {
      const key = `orden-${ordenIdNuevo}`;
      if (hydratedKey.current === key) return;
      useRemision.getState().hydrateFromBorrador(borrador, ordenIdNuevo);
      hydratedKey.current = key;
    }
  }, [editingId, detalleExistente, borrador, ordenIdNuevo]);
  useEffect(() => () => useRemision.getState().reset(), []);

  // Refresh directo a ?libre=1 pierde el cliente del store (modo libre vive en
  // memoria) → regresa a la pantalla de entrada en vez de un editor sin cliente.
  useEffect(() => {
    if (libre && editingId == null && !useRemision.getState().clienteId) {
      navigate('/spa/remisiones-nueva', { replace: true });
    }
  }, [libre, editingId, navigate]);

  if (!ordenIdNuevo && !libre && editingId == null) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <PageHeader
          backTo="/spa/remisiones"
          title={
            <span className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-cyan-400" /> Nueva remisión
            </span>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-2">Nueva libre (sin orden)</h2>
            <p className="text-xs text-muted-foreground mb-3">Elige un cliente y arma la remisión desde el catálogo.</p>
            <RemisionClientPicker
              onPick={(c) => {
                useRemision.getState().hydrateLibre({ id: c.id, nombre: c.nombre_empresa });
                navigate('/spa/remisiones-nueva?libre=1');
              }}
            />
          </div>
          <div className="border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-2">Desde una orden de venta</h2>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {(ordenes ?? []).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => navigate(`/spa/remisiones-nueva?orden=${o.id}`)}
                  className="w-full text-left px-2 py-2 hover:bg-surface-2/60 flex items-center justify-between"
                >
                  <span className="font-mono text-sm text-accent-glow">{o.folio}</span>
                  <span className="text-xs text-muted-foreground">{o.cliente ?? ''}</span>
                </button>
              ))}
              {(ordenes ?? []).length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">No hay órdenes remisionables.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (editingId != null) {
    if (cargandoDetalle || (detalleExistente?.orden_venta_id != null && cargandoBorrador)) {
      return <div className="p-6 text-sm text-muted-foreground/70">Cargando borrador…</div>;
    }
    if (detalleExistente && detalleExistente.estado !== 'borrador') {
      return (
        <div className="p-6 max-w-xl mx-auto text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Esta remisión ya no es un borrador (estado: {detalleExistente.estado}) — no se puede editar aquí.
          </p>
          <Button size="sm" onClick={() => navigate('/spa/remisiones')}>Volver al listado</Button>
        </div>
      );
    }
  } else if (ordenIdNuevo && cargandoBorrador) {
    return <div className="p-6 text-sm text-muted-foreground/70">Cargando orden…</div>;
  }

  const opcionesUnidad = (unidadesData ?? []).filter((u) => u.activa).map((u) => u.nombre);

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
  };

  // Las líneas de orden viven en PartidasSeleccionTable (con sus columnas de
  // acumulado) — el carrito solo muestra las ad-hoc (catálogo/fantasma/
  // servicio agregadas a mano), igual que en modo libre.
  const lineasAdHoc = s.lineas.filter((l) => l.detalle_orden_id == null);
  const rows: DocRowVM[] = lineasAdHoc.map((l) => remisionLineaToVM(l, s.moneda));
  const cb: DocRowCallbacks = {
    onQty: (uid, qty) => s.setQty(uid, qty),
    onRemove: (uid) => s.removeLinea(uid),
    onToggleExpand: (uid) => s.toggleExpand(uid),
    onPrecio: (uid, v) => s.setPrecio(uid, v),
    onUnidad: (uid, unidad) => s.setUnidad(uid, unidad),
  };

  const incluidas = s.lineas.filter((l) => l.incluir && l.cantidad > 0);
  const subtotal = incluidas.reduce((acc, l) => acc + l.precio_unitario * l.cantidad, 0);

  function buildDetalles(): RemisionDetalleInput[] {
    return incluidas.map((l) => ({
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

  function onGuardar() {
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
          orden_venta_id: s.modo === 'orden' ? (ordenIdContexto ?? ordenIdNuevo) : null,
          cliente_id: s.modo === 'libre' ? s.clienteId : null,
          moneda: s.moneda,
          transportista: s.transportista.trim() || null,
          observaciones: s.observaciones.trim() || null,
          mostrar_precios: s.mostrarPrecios,
          detalles: buildDetalles(),
        },
        {
          onSuccess: (r) => {
            toast({ kind: 'success', title: 'Borrador de remisión guardado' });
            setSavedId(r.id);
            // Reabre por su ruta canónica: un refresh no pierde el draft, y
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
          detalles: buildDetalles(),
        },
      },
      {
        onSuccess: () => toast({ kind: 'success', title: 'Borrador actualizado' }),
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
        navigate('/spa/remisiones');
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

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <div className="flex-1 p-4 max-w-7xl mx-auto w-full space-y-3">
        <PageHeader
          backTo="/spa/remisiones"
          backLabel="Volver"
          title={
            <span className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-accent-glow" /> Nueva remisión
            </span>
          }
          actions={
            <>
              {s.ordenFolio && (
                <span className="text-xs bg-cyan-900/30 text-cyan-300 border border-cyan-700/50 px-2 py-1 rounded font-mono">
                  {s.ordenFolio}
                </span>
              )}
              {savedId != null && (
                <span className="text-xs bg-surface-2 text-muted-foreground border border-border px-2 py-1 rounded">
                  Borrador #{savedId}
                </span>
              )}
              <button
                type="button"
                onClick={() => s.setMostrarPrecios(!s.mostrarPrecios)}
                className="text-[11px] px-2 py-1 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition flex items-center gap-1"
              >
                {s.mostrarPrecios ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {s.mostrarPrecios ? 'Precios visibles' : 'Precios ocultos'}
              </button>
            </>
          }
        />

        {s.clienteNombre && (
          <div className="text-sm bg-surface-2 border border-border rounded-md px-4 py-2 flex items-center gap-3 flex-wrap">
            <span className="text-muted-foreground">{s.clienteNombre}</span>
            {s.modo === 'libre' ? (
              <select
                value={s.moneda}
                onChange={(e) => s.setMoneda(e.target.value)}
                className="h-7 text-xs rounded border border-border-strong bg-card px-1"
              >
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            ) : (
              <span className="text-muted-foreground">{s.moneda}</span>
            )}
          </div>
        )}

        {s.modo === 'orden' && <PartidasSeleccionTable />}

        <DocumentSectionDivider icon={<Package className="h-3 w-3" />} label="Productos" />
        <RemisionProductSearch onOpenManualFantasma={() => setModalFantasma(true)} />

        <DocumentCartTable rows={rows} caps={REMISION_CAPS} cb={cb} />

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Transportista</label>
          <Input value={s.transportista} onChange={(e) => s.setTransportista(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Observaciones generales</label>
          <Input value={s.observaciones} onChange={(e) => s.setObservaciones(e.target.value)} />
        </div>
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
              disabled={savedId == null || emitir.isPending}
              title={savedId == null ? 'Guarda el borrador antes de emitir' : undefined}
            >
              {emitir.isPending ? 'Emitiendo…' : 'Emitir'}
            </Button>
          </>
        }
      />

      <AgregarLineaFantasmaModal
        open={modalFantasma}
        onClose={() => setModalFantasma(false)}
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
    </div>
  );
}
