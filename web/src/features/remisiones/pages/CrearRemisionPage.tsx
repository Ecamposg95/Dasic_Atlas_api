import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Truck, Package, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/lib/toast';
import { DocumentCartTable } from '@/components/document/DocumentCartTable';
import { DocumentTotalsBar } from '@/components/document/DocumentTotalsBar';
import { DocumentSectionDivider } from '@/components/document/DocumentSectionDivider';
import type { DocRowCaps, DocRowCallbacks, DocRowVM } from '@/components/document/types';
import { useRemisionBorrador, useCrearRemision, useOrdenesRemisionables } from '../hooks/useRemisiones';
import { useRemision } from '../store';
import { remisionLineaToVM } from '../lib/vm';
import { RemisionProductSearch } from '../components/RemisionProductSearch';
import { AgregarLineaFantasmaModal } from '../components/AgregarLineaFantasmaModal';
import { RemisionClientPicker } from '../components/RemisionClientPicker';

function fmtMoney(n: number, moneda: string) {
  return `${moneda} $${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CrearRemisionPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ordenParam = params.get('orden');
  const ordenId = ordenParam ? parseInt(ordenParam, 10) : null;
  const libre = params.get('libre') === '1';

  const { data: borrador, isLoading } = useRemisionBorrador(ordenId);
  const { data: ordenes } = useOrdenesRemisionables();
  const crear = useCrearRemision();
  const [modalFantasma, setModalFantasma] = useState(false);

  const s = useRemision();

  useEffect(() => {
    if (borrador && ordenId != null && useRemision.getState().ordenId !== ordenId) {
      s.hydrateFromBorrador(borrador, ordenId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrador, ordenId]);
  useEffect(() => () => useRemision.getState().reset(), []);

  // Refresh directo a ?libre=1 pierde el cliente del store (modo libre vive en
  // memoria) → regresa a la pantalla de entrada en vez de un editor sin cliente.
  useEffect(() => {
    if (libre && !useRemision.getState().clienteId) navigate('/spa/remisiones-nueva', { replace: true });
  }, [libre, navigate]);

  if (!ordenId && !libre) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <PageHeader
          backTo="/spa/remisiones"
          title={
            <span className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-accent-glow" /> Nueva remisión
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

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground/70">Cargando orden…</div>;

  const REMISION_CAPS: DocRowCaps = {
    showCosto: false,
    showUtilidad: false,
    showDescuento: false,
    showEntrega: false,
    showImporte: s.mostrarPrecios,
    editableQty: true,
    editablePrecio: s.mostrarPrecios,
  };

  const rows: DocRowVM[] = s.lineas.map((l) => remisionLineaToVM(l, s.moneda));
  const cb: DocRowCallbacks = {
    onQty: (uid, qty) => s.setQty(uid, qty),
    onRemove: (uid) => s.removeLinea(uid),
    onToggleExpand: (uid) => s.toggleExpand(uid),
    onPrecio: (uid, v) => s.setPrecio(uid, v),
  };

  const subtotal = s.lineas.reduce((acc, l) => acc + l.precio_unitario * l.cantidad, 0);
  const incluidas = s.lineas.filter((l) => l.cantidad > 0);

  function onGuardar() {
    if (incluidas.length === 0) {
      toast({ kind: 'warning', title: 'Incluye al menos una línea con cantidad > 0' });
      return;
    }
    crear.mutate(
      {
        orden_venta_id: s.modo === 'orden' ? ordenId : null,
        cliente_id: s.modo === 'libre' ? s.clienteId : null,
        moneda: s.moneda,
        transportista: s.transportista.trim() || null,
        observaciones: s.observaciones.trim() || null,
        mostrar_precios: s.mostrarPrecios,
        detalles: incluidas.map((l) => ({
          detalle_orden_id: l.detalle_orden_id,
          descripcion: l.descripcion,
          sku: l.sku,
          cantidad: l.cantidad,
          observaciones_linea: l.observaciones_linea || null,
          clave_unidad_sat: l.clave_unidad_sat,
          precio_unitario: l.detalle_orden_id == null ? l.precio_unitario : null,
        })),
      },
      {
        onSuccess: (r) => {
          toast({ kind: 'success', title: `Remisión ${r.folio} creada` });
          window.open(`/api/remisiones/${r.id}/imprimir`, '_blank');
          navigate('/spa/remisiones');
        },
        onError: (e) => {
          const err = e as unknown as { status?: number; detail?: string };
          if (err.status === 401) { window.location.href = '/spa/login'; return; }
          toast({ kind: 'error', title: 'No se pudo crear', description: err.detail });
        },
      },
    );
  }

  return (
    <div className="flex flex-col min-h-full">
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
                <span className="text-xs bg-accent-glow/10 text-accent-glow border border-accent-glow/40 px-2 py-1 rounded font-mono">
                  {s.ordenFolio}
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
        stats={
          s.mostrarPrecios
            ? [{ label: 'Subtotal', value: fmtMoney(subtotal, s.moneda), emphasis: 'big' }]
            : [{ label: 'Líneas', value: String(incluidas.length), emphasis: 'big' }]
        }
        actions={
          <Button size="sm" onClick={onGuardar} disabled={crear.isPending}>
            {crear.isPending ? 'Guardando…' : 'Generar remisión'}
          </Button>
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
