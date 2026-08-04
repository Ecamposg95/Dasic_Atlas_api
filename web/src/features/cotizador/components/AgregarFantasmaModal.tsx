import { useEffect, useRef, useState } from 'react';
import { confirm } from '@/lib/confirm';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { Ghost, X, Building2, DollarSign, Hash, Percent, Recycle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SatCombobox } from '@/components/ui/sat-combobox';
import { Button } from '@/components/ui/button';
import { useCotizador } from '../store';
import { ProveedorPicker } from './ProveedorPicker';
import { useFantasmasSearch, type FantasmaPrevio } from '../hooks/useFantasmasSearch';
import type { Moneda } from '../types';

/**
 * Modal para agregar una línea fantasma al cart. Escucha el evento
 * `cot:open-add-fantasma` (opcional payload `{ initialDescripcion: string }`)
 * — dispatcheado desde:
 *   - El botón "+ Fantasma" junto al ProductSearch
 *   - El estado vacío del ProductSearch ("Agregar como fantasma con este texto")
 *
 * Al guardar, llama a `store.addLineaAdhoc()` y cierra. No persiste al
 * backend aquí — la línea queda en el cart y se persiste con el flow normal
 * de Guardar cotización.
 */
export function AgregarFantasmaModal() {
  const [open, setOpen] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [skuLibre, setSkuLibre] = useState('');
  const [costo, setCosto] = useState('0');
  const [moneda, setMoneda] = useState<Moneda>('MXN');
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [utilidad, setUtilidad] = useState('30');
  const [qty, setQty] = useState('1');
  const [marca, setMarca] = useState('');
  const [claveProdServ, setClaveProdServ] = useState('');
  const [claveUnidadSat, setClaveUnidadSat] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Cuando el usuario hace click en un fantasma sugerido, guardamos el id
  // para mostrar el banner "Reusando fantasma #N". Cualquier edición posterior
  // a la descripción limpia el flag (porque la coincidencia ya no aplica).
  const [reusingFantasma, setReusingFantasma] = useState<FantasmaPrevio | null>(null);

  const addLineaAdhoc = useCotizador((s) => s.addLineaAdhoc);
  const monedaCot = useCotizador((s) => s.moneda);

  // Lookup en vivo: cada keystroke en descripción (debounceado en el hook)
  // busca fantasmas previos con descripción/SKU similar. Si hay matches
  // el panel debajo del textarea ofrece reusar en lugar de capturar.
  const lookup = useFantasmasSearch(descripcion);
  const sugerencias: FantasmaPrevio[] = lookup.items.slice(0, 5);
  // Filtrar al fantasma ya reusado para no mostrarlo como sugerencia.
  const sugerenciasMostradas = reusingFantasma
    ? sugerencias.filter((f) => f.id !== reusingFantasma.id)
    : sugerencias;

  useEffect(() => {
    function onOpen(e: Event) {
      const ce = e as CustomEvent<{ initialDescripcion?: string; initialSku?: string }>;
      // US-002: el texto buscado se arrastra al SKU libre (campo superior).
      // `initialDescripcion` se mantiene por compatibilidad con otros disparadores.
      setDescripcion(ce.detail?.initialDescripcion ?? '');
      setSkuLibre(ce.detail?.initialSku ?? '');
      setCosto('0');
      setMoneda(monedaCot); // default = moneda de la cotización
      setProveedorId(null);
      setUtilidad('30');
      setQty('1');
      setMarca('');
      setClaveProdServ('');
      setClaveUnidadSat('');
      setObservaciones('');
      setErr(null);
      setReusingFantasma(null);
      setOpen(true);
    }
    function onEsc(e: KeyboardEvent) {
      // Esc cuenta como intento de cierre: pasa por la guarda de datos
      // capturados (vía ref para no leer estado obsoleto del closure).
      if (e.key === 'Escape') requestCloseRef.current();
    }
    window.addEventListener('cot:open-add-fantasma', onOpen);
    document.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('cot:open-add-fantasma', onOpen);
      document.removeEventListener('keydown', onEsc);
    };
  }, [monedaCot]);

  function onPickSugerencia(f: FantasmaPrevio) {
    // Rellenar form con todos los datos del fantasma previo. El usuario
    // puede ajustar cualquiera antes de guardar — el upsert backend
    // consolidará por descripción normalizada igual.
    setDescripcion(f.descripcion);
    setSkuLibre(f.sku_libre ?? '');
    setCosto(String(f.costo_referencia ?? 0));
    setMoneda((f.moneda || 'MXN').toUpperCase() === 'USD' ? 'USD' : 'MXN');
    setProveedorId(f.proveedor_sugerido_id ?? null);
    setReusingFantasma(f);
    setErr(null);
  }

  function onDescripcionChange(v: string) {
    setDescripcion(v);
    // Si el usuario edita y se desvía del fantasma reusado, romper el reuse.
    if (reusingFantasma && v.trim() !== reusingFantasma.descripcion.trim()) {
      setReusingFantasma(null);
    }
  }

  function onSave() {
    setErr(null);
    const desc = descripcion.trim();
    if (!desc) { setErr('La descripción es obligatoria.'); return; }
    const c = parseFloat(costo);
    if (!Number.isFinite(c) || c <= 0) { setErr('El costo debe ser mayor a 0.'); return; }
    const q = parseInt(qty, 10);
    if (!Number.isFinite(q) || q <= 0) { setErr('La cantidad debe ser mayor a 0.'); return; }
    const u = parseFloat(utilidad);

    addLineaAdhoc({
      descripcion: desc,
      sku_libre: skuLibre.trim() || undefined,
      costo: c,
      moneda,
      proveedor_sugerido_id: proveedorId,
      utilidad: Number.isFinite(u) ? Math.max(0, Math.min(99, u)) : 30,
      qty: q,
      marca: marca.trim() || undefined,
      clave_prod_serv: claveProdServ.trim() || undefined,
      clave_unidad_sat: claveUnidadSat.trim() || undefined,
      observaciones: observaciones.trim() || undefined,
    });
    setOpen(false);
  }

  // ¿El usuario capturó algo que perdería al cerrar? Comparamos contra los
  // defaults con que se abre el modal (costo '0', utilidad '30', qty '1').
  function formIsDirty() {
    return (
      descripcion.trim() !== '' ||
      skuLibre.trim() !== '' ||
      (costo !== '' && costo !== '0') ||
      proveedorId !== null ||
      utilidad !== '30' ||
      qty !== '1' ||
      marca.trim() !== '' ||
      claveProdServ.trim() !== '' ||
      claveUnidadSat.trim() !== '' ||
      observaciones.trim() !== '' ||
      reusingFantasma !== null
    );
  }

  // Único punto de salida intencional (Esc / X / Cancelar). El click-fuera ya
  // no cierra. Si hay datos capturados, pedimos confirmación antes de descartar.
  async function requestClose() {
    if (!open) return;
    if (formIsDirty() && !(await confirm({ mensaje: 'Tienes datos capturados en el producto fantasma. ¿Descartarlos y cerrar?', tono: 'danger' }))) {
      return;
    }
    setOpen(false);
  }

  // El listener de Esc vive en un effect con deps estables; usamos un ref para
  // que siempre invoque la versión más reciente de requestClose (con el estado
  // actual del formulario), sin re-registrar el listener en cada keystroke.
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  if (!open) return null;

  return (
    <div
      data-overlay
      className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4"
      // El click fuera NO cierra: evita perder datos capturados por accidente.
      // El cierre solo ocurre vía Esc / X / Cancelar (con guarda) o Guardar.
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="fantasma-title" className="bg-card border border-amber-700/50 rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col">
        {/* US-004: header y footer fijos (shrink-0), cuerpo scrolleable. El
            modal nunca excede 90vh y los botones quedan siempre visibles. */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0 border-b border-border">
          <h3 id="fantasma-title" className="text-lg font-semibold flex items-center gap-2">
            <Ghost className="h-4 w-4 text-amber-400" />
            {reusingFantasma ? 'Reusar fantasma previo' : 'Agregar producto fantasma'}
          </h3>
          <button type="button" onClick={requestClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
        {reusingFantasma ? (
          <div className="text-[11px] text-emerald-300/90 mb-4 bg-emerald-900/15 border border-emerald-700/40 rounded p-2 flex items-start gap-2">
            <Recycle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                Reusando fantasma #{reusingFantasma.id}
                {reusingFantasma.veces_solicitado > 1 && (
                  <span className="ml-1 font-normal opacity-80">
                    · pedido {reusingFantasma.veces_solicitado} veces antes
                  </span>
                )}
              </div>
              <div className="opacity-80">
                Puedes ajustar cualquier campo; el sistema consolida automáticamente.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReusingFantasma(null)}
              className="text-emerald-300/70 hover:text-emerald-200 text-[11px] underline"
              title="Descartar reuse y crear uno nuevo con esta descripción"
            >
              cancelar
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-amber-300/80 mb-4 bg-amber-900/10 border border-amber-700/30 rounded p-2">
            Producto que no está en el catálogo (todavía). Al guardar la cotización,
            se apila en el pool de fantasmas y queda disponible para generar OC al
            proveedor que asignes aquí. Si ya existe un fantasma similar, aparecerá
            como sugerencia debajo del campo descripción.
          </p>
        )}

        <div className="space-y-3">
          {/* US-002: SKU como primer campo. Recibe el texto buscado arrastrado
              desde el buscador; editable antes de guardar. */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Hash className="h-2.5 w-2.5" /> SKU libre <span className="text-muted-foreground normal-case">(opcional)</span>
            </label>
            <Input
              value={skuLibre}
              onChange={(e) => setSkuLibre(e.target.value)}
              placeholder="Catalog # del proveedor o texto buscado"
              className="h-8 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Descripción <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => onDescripcionChange(e.target.value)}
              rows={2}
              placeholder='Ej. "Sensor inductivo M12 24VDC PNP NA marca Balluff"'
              autoFocus
              className="w-full text-sm rounded border border-border-strong bg-card px-3 py-2 focus:border-accent-glow outline-none resize-none"
            />
            {sugerenciasMostradas.length > 0 && (
              <div className="mt-2 border border-amber-700/40 bg-amber-950/30 rounded-md overflow-hidden">
                <div className="px-2 py-1 text-[11px] uppercase tracking-[0.15em] text-amber-300/80 bg-amber-900/30 border-b border-amber-700/30 flex items-center gap-1">
                  <Ghost className="h-2.5 w-2.5" />
                  {lookup.isFetching ? 'Buscando…' : `${sugerenciasMostradas.length} fantasma(s) previo(s) similares — click para reusar`}
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {sugerenciasMostradas.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onPickSugerencia(f)}
                      className="w-full text-left px-2 py-1.5 hover:bg-amber-900/40 transition border-b border-amber-700/20 last:border-b-0 flex items-center gap-2"
                    >
                      <Recycle className="h-3 w-3 text-amber-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {f.sku_libre && (
                            <span className="font-mono text-[11px] font-bold text-amber-300">{f.sku_libre}</span>
                          )}
                          {f.proveedor_sugerido_nombre && (
                            <span className="text-[11px] text-muted-foreground">· {f.proveedor_sugerido_nombre}</span>
                          )}
                          {f.veces_solicitado > 1 && (
                            <span className="text-[11px] bg-amber-900/50 text-amber-200 px-1.5 py-0.5 rounded">
                              ×{f.veces_solicitado}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-foreground truncate">{f.descripcion}</div>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono whitespace-nowrap">
                        {(f.moneda || 'MXN').toUpperCase()} ${Number(f.costo_referencia).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign className="h-2.5 w-2.5" /> Costo unit. <span className="text-rose-400">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                className="h-8 text-xs text-right font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Moneda costo</label>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as Moneda)}
                className="w-full h-8 rounded border border-border-strong bg-card px-2 text-xs"
              >
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                <Percent className="h-2.5 w-2.5" /> Utilidad %
              </label>
              <Input
                type="number"
                min="0"
                max="99"
                value={utilidad}
                onChange={(e) => setUtilidad(e.target.value)}
                className="h-8 text-xs text-right"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Cantidad <span className="text-rose-400">*</span>
              </label>
              <Input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="h-8 text-xs text-right"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <Building2 className="h-2.5 w-2.5" />
              Proveedor sugerido <span className="text-muted-foreground normal-case">(opcional pero recomendado)</span>
            </label>
            <ProveedorPicker value={proveedorId} onChange={setProveedorId} />
            <div className="text-[11px] text-muted-foreground mt-1">
              Sin proveedor, esta línea quedará en el bucket "sin proveedor" al generar OCs.
            </div>
          </div>

          {/* US-008: marca + claves SAT + notas del fantasma (opcionales). Se
              apilan en el pool de fantasmas y se snapshotean en la línea. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Marca</label>
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Marca del producto" className="h-8 text-xs" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Clave prod/serv SAT</label>
              <SatCombobox value={claveProdServ} onChange={setClaveProdServ} endpoint="/api/sat/clave-prod-serv" minChars={2} maxLength={8} placeholder="Buscar o escribir" className="h-8 text-xs font-mono" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Clave unidad SAT</label>
              <SatCombobox value={claveUnidadSat} onChange={setClaveUnidadSat} endpoint="/api/sat/clave-unidad" minChars={1} maxLength={10} placeholder="Buscar unidad" className="h-8 text-xs font-mono" />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Observaciones</label>
              <Input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Notas" className="h-8 text-xs" />
            </div>
          </div>
        </div>

        {err && (
          <div className="mt-3 text-xs bg-rose-900/30 border border-rose-700/50 rounded px-3 py-2 text-rose-300">
            {err}
          </div>
        )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 shrink-0 border-t border-border">
          <Button variant="ghost" size="sm" onClick={requestClose}>Cancelar</Button>
          <Button size="sm" onClick={onSave} className="bg-amber-600 hover:bg-amber-700 text-white">
            {reusingFantasma ? (
              <>
                <Recycle className="h-3 w-3 mr-1" /> Reusar fantasma
              </>
            ) : (
              <>
                <Ghost className="h-3 w-3 mr-1" /> Agregar al carrito
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
