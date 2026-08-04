import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  ClipboardList,
  Download,
  Upload,
  MoreVertical,
  Package,
  MessageSquare,
  FileOutput,
  Pencil,
  Truck,
} from 'lucide-react';
import { HeaderCotizacion } from '../components/HeaderCotizacion';
import { ProductSearch } from '../components/ProductSearch';
import { Cart } from '../components/Cart';
import { TotalsBar } from '../components/TotalsBar';
import { EditLineModal } from '../components/EditLineModal';
import { TabsCotizador, type CotizadorTab } from '../components/TabsCotizador';
import { HistorialTab } from '../components/HistorialTab';
import { AtajosPopover } from '../components/AtajosPopover';
import { PlantillasModal } from '../components/PlantillasModal';
import { SuggestRelacionados } from '../components/SuggestRelacionados';
import { DrawerBorradores } from '../components/DrawerBorradores';
import { PreviewOCDrawer } from '../components/PreviewOCDrawer';
import { ModalNotaLinea } from '../components/ModalNotaLinea';
import { ModalTerminos } from '../components/ModalTerminos';
import { ModalConceptoPDF } from '../components/ModalConceptoPDF';
import { AgregarFantasmaModal } from '../components/AgregarFantasmaModal';
import { AvanceEntregaCard } from '../components/AvanceEntregaCard';
import { GenerarReporteServicioModal } from '@/features/reportes_servicio_docs/components/GenerarReporteServicioModal';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { PageHeader } from '@/components/ui/page-header';
import { useCotizador } from '../store';
import { useCotizacionLoader } from '../hooks/useCotizacion';
import { useAtajos, type AtajoHandler } from '../hooks/useAtajos';
import { exportBorrador, importBorrador } from '../lib/jsonExport';
import { api } from '@/lib/api';
import type { Producto } from '../types';
import { toast } from '@/lib/toast';

export function CotizadorPage() {
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const editIdNum = editId ? parseInt(editId, 10) : null;
  const clienteParam = params.get('cliente');
  const contactoParam = params.get('contacto');
  // Vínculo con CRM: al llegar desde un deal (?deal_id=&cliente_id=), se
  // preselecciona el cliente y, al crear la orden, useGuardarCotizacion hace
  // PATCH del deal con la orden creada y limpia el param (ver useCotizacion.ts).
  const clienteIdParam = params.get('cliente_id');
  const dealIdParam = params.get('deal_id');
  const [tab, setTab] = useState<CotizadorTab>('editor');

  const reset = useCotizador((s) => s.reset);
  const hydrateFromOrden = useCotizador((s) => s.hydrateFromOrden);
  const editingFolio = useCotizador((s) => s.editingFolio);
  const editingId = useCotizador((s) => s.editingId);
  const editingEstatus = useCotizador((s) => s.editingEstatus);
  const cliente_id = useCotizador((s) => s.cliente_id);
  const cartLen = useCotizador((s) => s.cart.length);
  const observaciones = useCotizador((s) => s.observaciones);
  const setObservaciones = useCotizador((s) => s.setObservaciones);
  const terminos = useCotizador((s) => s.terminos_condiciones);
  const pdfConceptoEnabled = useCotizador((s) => s.pdf_concepto_enabled);
  const pdfConceptoUnificado = useCotizador((s) => s.pdf_concepto_unificado);
  const setPdfConceptoEnabled = useCotizador((s) => s.setPdfConceptoEnabled);

  const { data: orden, isLoading, error } = useCotizacionLoader(editIdNum);

  // Phase 5 (Task 5.2): Export / Import del borrador a JSON.
  // `useRef` para mantener el <input type=file> oculto que se dispara al
  // hacer click en el botón Upload.
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const s = useCotizador.getState();
    const json = exportBorrador({
      cliente_id: s.cliente_id,
      moneda: s.moneda,
      tc: s.tc,
      observaciones: s.observaciones,
      terminos_condiciones: s.terminos_condiciones,
      cart: s.cart,
    });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `cotizacion-borrador-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ kind: 'success', title: 'Borrador exportado', description: a.download });
  }

  async function handleImportFile(file: File) {
    let snap: ReturnType<typeof importBorrador>;
    try {
      const text = await file.text();
      snap = importBorrador(text);
    } catch (err) {
      toast({
        kind: 'error',
        title: 'No se pudo importar',
        description: (err as Error).message || 'Archivo inválido',
      });
      return;
    }
    const st = useCotizador.getState();
    st.reset();
    if (snap.cliente_id != null) st.setCliente(snap.cliente_id);
    st.setMoneda(snap.moneda);
    st.setTc(snap.tc);
    st.setObservaciones(snap.observaciones);
    st.setTerminos(snap.terminos_condiciones);

    let agregadas = 0;
    let saltadas = 0;
    for (const it of snap.cart) {
      if (it.producto_id == null) {
        saltadas += 1;
        continue;
      }
      try {
        const p = await api.get<Producto>(`/api/productos/${it.producto_id}`);
        st.addProducto(p, it.qty, it.utilidad);
        const uid = useCotizador.getState().cart.slice(-1)[0]?.uid;
        if (uid) {
          st.updateLinea(uid, {
            descuento: it.descuento,
            sku: it.sku,
            nom: it.nom,
            cost: it.cost,
            entrega_min: it.entrega_min,
            entrega_max: it.entrega_max,
            entrega_unidad: it.entrega_unidad,
            observaciones_linea: it.observaciones_linea,
            descuento_proveedor: it.descuento_proveedor ?? 0,
            marca: it.marca ?? null,
            mostrar_marca: it.mostrar_marca ?? false,
            proveedor_sugerido_id: it.proveedor_sugerido_id ?? null,
          });
        }
        agregadas += 1;
      } catch {
        // Producto eliminado del catálogo o sin permisos; lo saltamos
        // sin abortar la importación.
        saltadas += 1;
      }
    }
    if (saltadas > 0) {
      toast({ kind: 'warning', title: `${saltadas} línea(s) ad-hoc/fantasma no se importaron`, description: 'El import JSON solo rehidrata líneas de catálogo.' });
    }
    toast({
      kind: 'success',
      title: 'Borrador importado',
      description: `${agregadas} línea(s) cargadas`,
    });
  }

  // Atajos globales del editor. Memoizado para que el effect del hook no
  // re-suscriba en cada render.
  const atajos = useMemo<AtajoHandler[]>(() => [
    {
      combo: '/',
      description: 'Enfocar búsqueda',
      handler: () => {
        (document.querySelector('[data-cot-search]') as HTMLInputElement | null)?.focus();
      },
    },
    {
      combo: 'ctrl+s',
      description: 'Guardar cotización',
      handler: () => {
        document.querySelector<HTMLButtonElement>('[data-cot-save]')?.click();
      },
    },
    {
      combo: 'p',
      description: 'Abrir plantillas',
      handler: () => {
        window.dispatchEvent(new CustomEvent('cot:open-plantillas'));
      },
    },
    {
      combo: '?',
      description: 'Mostrar este popover',
      handler: () => {
        window.dispatchEvent(new CustomEvent('cot:open-atajos'));
      },
    },
  ], []);
  useAtajos(atajos);

  // Reset síncrono al navegar de una cot a otra (edit→edit) o recotizar, para
  // que editingId no apunte al pedido anterior durante la carga del nuevo
  // detalle. La hidratación de abajo repuebla editingId al id correcto cuando
  // llega `orden`.
  useEffect(() => {
    if (editIdNum != null && useCotizador.getState().editingId !== editIdNum) {
      reset();
    }
  }, [editIdNum, reset]);

  // Hydrate when the GET resolves
  useEffect(() => {
    if (orden) hydrateFromOrden(orden);
  }, [orden, hydrateFromOrden]);

  // Reset store on unmount so the next visit starts fresh
  useEffect(() => () => reset(), [reset]);

  // Cotización NUEVA (sin ?edit=) pero el store trae una cotización cargada o
  // guardada antes (editingId !== null): limpiar para no arrastrar
  // cliente/contacto/carrito de la anterior. No pisa un borrador fresco sin
  // guardar (editingId === null). Corre antes del pre-poblado de abajo.
  useEffect(() => {
    if (editIdNum == null && useCotizador.getState().editingId != null) {
      reset();
    }
  }, [editIdNum, reset]);

  // Pre-poblar desde Contactos/Empresas (?cliente=<id>&contacto=<id>) o desde
  // un deal del CRM (?deal_id=<id>&cliente_id=<id>).
  // Solo en cotización nueva (sin ?edit=) y una vez al montar.
  useEffect(() => {
    if (editIdNum != null) return;
    const rawCliente = clienteParam || clienteIdParam;
    const cid = rawCliente ? parseInt(rawCliente, 10) : null;
    const coid = contactoParam ? parseInt(contactoParam, 10) : null;
    if (cid != null && !Number.isNaN(cid)) {
      const st = useCotizador.getState();
      st.setCliente(cid);
      if (coid != null && !Number.isNaN(coid)) st.setContacto(coid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aviso nativo del navegador al cerrar/recargar con líneas sin guardar.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (useCotizador.getState().cart.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Auth error → bounce to login
  useEffect(() => {
    const status = (error as { status?: number } | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  const noEditable = !!editingEstatus && editingEstatus.toUpperCase() !== 'COTIZACION';

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 w-full space-y-3">
        <PageHeader
          className="mb-0"
          title={
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-accent-glow" />
              {editingId ? 'Editar cotización' : 'Nueva cotización'}
            </span>
          }
          actions={
            <>
            {dealIdParam && (
              <span
                title="Al guardar, la cotización se ligará a este deal del CRM"
                className="text-xs bg-sky-900/30 text-sky-300 border border-sky-700/50 px-2 py-1 rounded"
              >
                Vinculado a deal #{dealIdParam}
              </span>
            )}
            {editingFolio && (
              <span className="text-xs bg-amber-900/30 text-amber-300 border border-amber-700/50 px-2 py-1 rounded flex items-center gap-1">
                <Pencil className="h-3 w-3" />
                <span>Editando</span>
                <strong className="font-mono">{editingFolio}</strong>
              </span>
            )}
            {/* Acciones secundarias: inline solo en md+. En móvil colapsan al
                menú overflow "⋯" de abajo (plan móvil F1). */}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent('cot:open-borradores'))
              }
              className="text-[11px] px-2 py-1 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition hidden md:flex items-center gap-1"
            >
              <ClipboardList className="h-3 w-3" /> Borradores
            </button>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent('cot:open-preview-oc'))
              }
              title="Preview de OCs que nacerán al guardar"
              className="text-[11px] px-2 py-1 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition hidden md:flex items-center gap-1"
            >
              <Truck className="h-3 w-3" /> Preview OC
            </button>
            <button
              type="button"
              onClick={handleExport}
              title="Exportar borrador a JSON"
              className="text-[11px] px-2 py-1 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition hidden md:flex items-center gap-1"
            >
              <Download className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Importar borrador desde JSON"
              className="text-[11px] px-2 py-1 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition hidden md:flex items-center gap-1"
            >
              <Upload className="h-3 w-3" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleImportFile(file);
                // Permite reimportar el mismo archivo si el usuario lo necesita.
                e.target.value = '';
              }}
            />
            {(editingId != null || (cliente_id != null && cartLen > 0)) && (
              <button
                type="button"
                onClick={() => {
                  // Con editingId ya guardado: abrir el PDF directo. Sin él:
                  // delegar en TotalsBar (vía evento) para guardar in-place y
                  // luego abrir el PDF del id recién creado.
                  if (editingId != null) {
                    window.open(`/api/ventas/${editingId}/pdf`, '_blank');
                  } else {
                    window.dispatchEvent(new CustomEvent('cot:ver-pdf'));
                  }
                }}
                title={editingId != null ? 'Ver PDF' : 'Guarda y abre el PDF'}
                className="text-[11px] px-2 py-1 min-h-[40px] md:min-h-0 rounded border border-border-strong hover:border-accent-glow text-foreground hover:text-accent-glow transition flex items-center gap-1"
              >
                <FileText className="h-3 w-3" /> Ver PDF
              </button>
            )}
            <AccionesOverflowMovil
              onExport={handleExport}
              onImport={() => fileInputRef.current?.click()}
            />
            </>
          }
        />

        <TabsCotizador active={tab} onChange={setTab} />

        {tab === 'editor' && (
          <>
            {isLoading && editIdNum != null && (
              <div className="text-xs text-muted-foreground bg-card border border-border rounded p-3">
                Cargando cotización #{editIdNum}…
              </div>
            )}
            {noEditable && (
              <div className="text-xs bg-rose-900/20 border border-rose-700/50 text-rose-300 rounded p-2">
                Esta orden ya no es editable (estatus <code>{editingEstatus}</code>). El botón Guardar está deshabilitado.
              </div>
            )}

            <HeaderCotizacion />

            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 mt-2">
              <Package className="h-3 w-3" />
              <span>Productos</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div>
              <ProductSearch />
            </div>

            <Cart />
            <SuggestRelacionados />

            {/* Solo para órdenes ya convertidas a venta (estatus != COTIZACION,
                mismo criterio que `noEditable`) — una cotización abierta no
                tiene remisiones asociadas todavía. */}
            {noEditable && editingId != null && <AvanceEntregaCard ordenId={editingId} />}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CollapsibleCard
                title="Observaciones"
                icon={<MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />}
                defaultOpen={!!observaciones.trim()}
              >
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={4}
                  placeholder="Notas internas o para el cliente…"
                  className="w-full text-xs rounded-md border border-border-strong bg-card px-2 py-2 focus:border-accent-glow outline-none"
                />
              </CollapsibleCard>
              <CollapsibleCard
                title="Términos y condiciones"
                icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                defaultOpen={!!(terminos && terminos.trim())}
              >
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('cot:open-terminos'))
                  }
                  className="w-full text-left text-xs rounded-md border border-border-strong bg-card px-2 py-2 hover:border-accent-glow text-foreground flex items-start gap-2 min-h-[5rem]"
                >
                  <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-muted-foreground mb-1">
                      {terminos.split('\n').filter((l) => l.trim()).length} cláusulas · click para editar
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {terminos || 'Vacío — se usarán los defaults del backend al guardar.'}
                    </div>
                  </div>
                </button>
              </CollapsibleCard>
            </div>

            <CollapsibleCard
              title="PDF unificado"
              icon={<FileOutput className="h-3.5 w-3.5 text-muted-foreground" />}
              defaultOpen={pdfConceptoEnabled}
            >
              <div className="flex items-center gap-3 text-[11px] flex-wrap">
                <label className="flex items-center gap-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={pdfConceptoEnabled}
                    onChange={(e) => setPdfConceptoEnabled(e.target.checked)}
                    className="accent-accent-glow"
                  />
                  PDF con concepto unificado
                </label>
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('cot:open-concepto'))
                  }
                  className="text-[11px] text-accent-glow hover:underline flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" /> Editar concepto…
                </button>
                {pdfConceptoEnabled && pdfConceptoUnificado && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-md">
                    «{pdfConceptoUnificado}»
                  </span>
                )}
              </div>
            </CollapsibleCard>
          </>
        )}

        {tab === 'historial' && (
          <HistorialTab clienteIdFiltro={cliente_id} />
        )}
      </div>

      {tab === 'editor' && <TotalsBar />}
      <EditLineModal />
      <PlantillasModal />
      {/* Modales/drawer Phase 4 — viven fuera del tab conditional para que sigan
          disponibles incluso si el usuario cambia a "Historial" mientras hay un
          modal abierto. La apertura es vía window events. */}
      <DrawerBorradores />
      <PreviewOCDrawer />
      <ModalNotaLinea />
      <ModalTerminos />
      <ModalConceptoPDF />
      <AgregarFantasmaModal />
      <GenerarReporteServicioModal />
      {tab === 'editor' && <AtajosPopover atajos={atajos} />}
    </div>
  );
}

/**
 * Menú overflow "⋯" del header en móvil (< md) — plan móvil F1. Agrupa las
 * acciones secundarias (Borradores, Preview OC, Export/Import JSON) que en
 * md+ siguen inline. Mismo patrón de dropdown que DocumentRow (overlay fixed
 * para click-fuera + cierre por Escape). Solo layout: reutiliza los mismos
 * window events y handlers que los botones de escritorio.
 */
function AccionesOverflowMovil({
  onExport,
  onImport,
}: {
  onExport: () => void;
  onImport: () => void;
}) {
  const [open, setOpen] = useState(false);

  // Cierre por Escape; el click-fuera lo cubre el overlay `fixed inset-0`.
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
                window.dispatchEvent(new CustomEvent('cot:open-borradores'));
                setOpen(false);
              }}
            >
              <ClipboardList className="h-3.5 w-3.5" /> Borradores
            </button>
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('cot:open-preview-oc'));
                setOpen(false);
              }}
            >
              <Truck className="h-3.5 w-3.5" /> Preview OC
            </button>
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onExport();
                setOpen(false);
              }}
            >
              <Download className="h-3.5 w-3.5" /> Exportar JSON
            </button>
            <button
              type="button"
              className={itemClass}
              onClick={() => {
                onImport();
                setOpen(false);
              }}
            >
              <Upload className="h-3.5 w-3.5" /> Importar JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}
