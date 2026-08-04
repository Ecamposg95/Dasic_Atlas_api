import { useEffect, useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { confirm } from '@/lib/confirm';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { Pen, RotateCcw, Shuffle, X, ArrowLeft, MessageSquare, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useIsAdmin } from '@/lib/permissions';
import { useCotizador } from '../store';
import { useProductosSearch } from '../hooks/useProductosSearch';
import { ProveedorPicker } from './ProveedorPicker';
import type { CartItem, Moneda, Producto } from '../types';

export function EditLineModal() {
  const cart = useCotizador((s) => s.cart);
  const updateLinea = useCotizador((s) => s.updateLinea);
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const panelRef = useRef<HTMLDivElement>(null);
  const [savingCat, setSavingCat] = useState(false);
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [sku, setSku] = useState('');
  const [cost, setCost] = useState('0');
  const [moneda, setMoneda] = useState<Moneda>('MXN');
  const [proveedorId, setProveedorId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showReplace, setShowReplace] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  // El reemplazo de línea solo sustituye por productos del catálogo, así que
  // siempre buscamos en scope `producto` sin filtros (Phase 5 — Task 5.1).
  const { data: searchData } = useProductosSearch({
    q: showReplace ? searchQ : '',
    tipo: 'producto',
  });
  const productos = (searchData?.items ?? []).map((it) => it.producto);

  const onClose = useCallback(() => {
    setOpen(false);
    setUid(null);
    setShowReplace(false);
  }, []);

  // Listen for the event
  useEffect(() => {
    function onEdit(e: Event) {
      const ce = e as CustomEvent<{ uid: string }>;
      const it = useCotizador.getState().cart.find((x) => x.uid === ce.detail.uid);
      if (!it) return;
      setUid(ce.detail.uid);
      setDesc(it.nom || '');
      setSku(it.sku || '');
      setCost(String(it.cost ?? 0));
      setMoneda((it.productCurrency || 'MXN') as Moneda);
      setProveedorId(it.proveedor_sugerido_id ?? null);
      setErr(null);
      setShowReplace(false);
      setSearchQ('');
      setOpen(true);
    }
    window.addEventListener('cot:edit-line', onEdit);
    return () => window.removeEventListener('cot:edit-line', onEdit);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const it: CartItem | undefined = cart.find((x) => x.uid === uid);
  const esFantasma = !!it && it.tipo_linea === 'producto_fantasma';
  const esCatalogo = !!it && it.producto_id != null;
  const hayDatosCatalogo = !!it && (
    !!it.sku_original || !!it.nom_original || (it.cost_original != null && it.cost_original > 0)
  );

  function onRestore() {
    if (!it || !hayDatosCatalogo) return;
    setDesc(it.nom_original || '');
    setSku(it.sku_original || '');
    setCost(String(it.cost_original ?? 0));
  }

  function onSave() {
    setErr(null);
    if (!desc.trim()) { setErr('La descripción es obligatoria.'); return; }
    const c = parseFloat(cost);
    if (!Number.isFinite(c) || c <= 0) { setErr('El costo debe ser mayor a 0.'); return; }
    if (!uid) return;
    if (esFantasma) {
      updateLinea(uid, {
        nom: desc.trim(),
        sku: sku.trim() || it?.sku || '',
        cost: c,
        productCurrency: moneda,
        proveedor_sugerido_id: proveedorId,
      });
    } else {
      updateLinea(uid, { nom: desc.trim(), sku: sku.trim() || it?.sku || '', cost: c });
    }
    onClose();
  }

  // Solo admin + línea de catálogo: aplica el override de línea Y actualiza el
  // PRODUCTO maestro en el catálogo (PUT). El fantasma no aplica: la línea
  // ad-hoc no lleva el id del fantasma del pool.
  async function onSaveAndCatalog() {
    setErr(null);
    if (!desc.trim()) { setErr('La descripción es obligatoria.'); return; }
    const c = parseFloat(cost);
    if (!Number.isFinite(c) || c <= 0) { setErr('El costo debe ser mayor a 0.'); return; }
    if (!uid || !it?.producto_id) return;
    if (!(await confirm({ mensaje: 'Esto cambiará el costo en el catálogo maestro para futuras cotizaciones. ¿Continuar?', tono: 'warning' }))) return;
    updateLinea(uid, { nom: desc.trim(), sku: sku.trim() || it?.sku || '', cost: c });
    setSavingCat(true);
    try {
      await api.put(`/api/productos/${it.producto_id}`, {
        nombre: desc.trim(),
        sku: sku.trim() || null,
        costo_compra: c,
      });
      qc.invalidateQueries({ queryKey: ['productos'] });
      toast({ kind: 'success', title: 'Producto actualizado en el catálogo' });
      onClose();
    } catch (e) {
      const err = e as { status?: number; detail?: string };
      if (err.status === 401) { window.location.href = '/spa/login'; return; }
      setErr(err.detail || 'No se pudo actualizar el catálogo');
    } finally {
      setSavingCat(false);
    }
  }

  function onPickReplacement(p: Producto) {
    if (!it || !uid) return;
    const skuNuevo = p.sku_comercial || p.sku || '—';
    const costNuevo = Number(p.costo_compra ?? 0);
    updateLinea(uid, {
      producto_id: p.id,
      sku: skuNuevo,
      nom: p.nombre,
      cost: costNuevo,
      productCurrency: (p.moneda_compra || 'MXN').toUpperCase() as 'MXN' | 'USD',
      sku_original: skuNuevo,
      nom_original: p.nombre,
      cost_original: costNuevo,
      max: p.stock_actual,
    });
    onClose();
  }

  useFocusTrap(panelRef, open && !!it);

  if (!open || !it) return null;

  return (
    <div data-overlay className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="editline-title" className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 id="editline-title" className="text-lg font-semibold flex items-center gap-2">
            <Pen className="h-4 w-4 text-accent-glow" /> Editar línea
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`inline-block text-[11px] font-bold uppercase px-2 py-0.5 rounded mb-3 ${
          esFantasma
            ? 'bg-purple-900/30 text-purple-300'
            : 'bg-cyan-900/30 text-cyan-300'
        }`}>
          {esFantasma
            ? '👻 Fantasma'
            : (esCatalogo ? `Catálogo · producto #${it.producto_id}` : 'Ad-hoc')}
        </div>

        {!showReplace ? (
          <>
            <label className="block text-xs text-muted-foreground mb-1">Descripción</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className="w-full text-sm rounded border border-border-strong bg-card px-2 py-1.5 mb-3 focus:border-accent-glow outline-none"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">SKU</label>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Costo base</label>
                <Input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
              </div>
            </div>

            {esFantasma && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Moneda</label>
                  <select
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value as Moneda)}
                    className="w-full h-8 rounded border border-border-strong bg-card text-xs px-2 focus:border-accent-glow outline-none"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Proveedor sugerido</label>
                  <ProveedorPicker value={proveedorId} onChange={setProveedorId} />
                </div>
              </div>
            )}

            {!esFantasma && esCatalogo && (
              <div className="text-xs bg-amber-900/20 border border-amber-700/50 rounded p-2 mb-3 text-amber-300">
                {isAdmin
                  ? '«Guardar» aplica el override solo en esta cotización. Usa «Guardar y actualizar catálogo» para modificar también el producto maestro.'
                  : 'Override solo en esta cotización. El catálogo no se modifica.'}
              </div>
            )}

            {err && (
              <div className="text-xs bg-rose-900/30 border border-rose-700/50 rounded p-2 mb-3 text-rose-300">
                {err}
              </div>
            )}

            {!esFantasma && esCatalogo && (
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={onRestore}
                  disabled={!hayDatosCatalogo}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar valores del catálogo
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReplace(true); setSearchQ(''); }}
                  className="text-xs text-accent-glow hover:underline ml-auto flex items-center gap-1"
                >
                  <Shuffle className="h-3 w-3" /> Reemplazar producto
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (!uid) return;
                // Cerramos este modal primero, luego abrimos el de nota tras un
                // tick para que React desmonte limpiamente antes del nuevo mount.
                onClose();
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('cot:open-nota', { detail: { uid } }),
                  );
                }, 100);
              }}
              className="text-xs text-muted-foreground hover:text-accent-glow hover:underline mb-3 flex items-center gap-1"
            >
              <MessageSquare className="h-3 w-3" /> Editar nota larga / productos similares…
            </button>

            <div className="flex justify-end gap-2 pt-3 border-t border-border flex-wrap">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={savingCat}>Cancelar</Button>
              {esCatalogo && isAdmin && (
                <Button variant="outline" size="sm" onClick={onSaveAndCatalog} disabled={savingCat}>
                  <Save className="h-3.5 w-3.5 mr-1" /> {savingCat ? 'Guardando…' : 'Guardar y actualizar catálogo'}
                </Button>
              )}
              <Button size="sm" onClick={onSave} disabled={savingCat}>Guardar</Button>
            </div>
          </>
        ) : (
          <>
            <label className="block text-xs text-muted-foreground mb-1">Buscar producto para reemplazar</label>
            <Input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="SKU, nombre o marca…"
              autoFocus
            />
            <div className="max-h-60 overflow-y-auto mt-2 space-y-1">
              {productos.length === 0 && (
                <div className="text-xs text-muted-foreground text-center p-4">
                  {searchQ ? 'Sin coincidencias' : 'Escribe para buscar productos del catálogo'}
                </div>
              )}
              {productos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPickReplacement(p)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-surface-2/60 transition border border-transparent hover:border-accent-glow/40"
                >
                  <div className="font-mono text-[11px] font-bold text-accent-glow">
                    {p.sku_comercial || p.sku || '—'}
                  </div>
                  <div className="text-xs text-foreground truncate">{p.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.moneda_compra || 'MXN'} ${Number(p.costo_compra ?? 0).toFixed(2)} · Stock {p.stock_actual ?? 0}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowReplace(false)}
              className="text-xs text-muted-foreground hover:underline mt-2 flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Volver a editar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
