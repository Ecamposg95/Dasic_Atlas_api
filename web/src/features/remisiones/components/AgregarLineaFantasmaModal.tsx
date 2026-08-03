import { useState } from 'react';
import { Ghost, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { RemisionLineaEdit } from '../types';

export function AgregarLineaFantasmaModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (linea: RemisionLineaEdit) => void;
}) {
  const [descripcion, setDescripcion] = useState('');
  const [sku, setSku] = useState('');
  const [claveUnidad, setClaveUnidad] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [precio, setPrecio] = useState('0');
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setDescripcion(''); setSku(''); setClaveUnidad(''); setCantidad('1'); setPrecio('0'); setErr(null);
  }

  function onSave() {
    const desc = descripcion.trim();
    if (!desc) { setErr('La descripción es obligatoria.'); return; }
    const q = parseInt(cantidad, 10);
    if (!Number.isFinite(q) || q <= 0) { setErr('La cantidad debe ser mayor a 0.'); return; }
    onAdd({
      detalle_orden_id: null,
      incluir: true,
      descripcion: desc,
      sku: sku.trim() || null,
      clave_unidad_sat: claveUnidad.trim() || null,
      precio_unitario: parseFloat(precio) || 0,
      cantidad: q,
      cantidad_max: null,
      observaciones_linea: '',
    });
    reset();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4">
      <div className="bg-card border border-amber-700/50 rounded-xl shadow-2xl max-w-lg w-full">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Ghost className="h-4 w-4 text-amber-500" /> Agregar producto fantasma
          </h3>
          <button type="button" onClick={() => { reset(); onClose(); }} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Descripción *</label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción del producto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">SKU</label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Clave unidad SAT</label>
              <Input value={claveUnidad} onChange={(e) => setClaveUnidad(e.target.value)} maxLength={10} placeholder="Ej. H87" className="font-mono" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Cantidad *</label>
              <Input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Precio unitario</label>
              <Input type="number" step="0.01" min="0" value={precio} onChange={(e) => setPrecio(e.target.value)} className="text-right font-mono" />
            </div>
          </div>
          {err && <div className="text-xs bg-rose-50 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700/50 rounded p-2 text-rose-700 dark:text-rose-300">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button size="sm" onClick={onSave} className="bg-amber-600 hover:bg-amber-700 text-white">Agregar</Button>
        </div>
      </div>
    </div>
  );
}
