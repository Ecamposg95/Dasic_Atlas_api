import { useEffect, useRef, useState } from 'react';
import { confirm } from '@/lib/confirm';
import { X, Folder, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { toast } from '@/lib/toast';
import { api, type ApiError } from '@/lib/api';
import { usePlantillas, useCrearPlantilla, useBorrarPlantilla } from '../hooks/usePlantillas';
import { useCotizador } from '../store';
import type { Plantilla, Producto } from '../types';

async function fetchProductoById(id: number): Promise<Producto | null> {
  try {
    return await api.get<Producto>(`/api/productos/${id}`);
  } catch {
    return null;
  }
}

export function PlantillasModal() {
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<'cargar' | 'guardar'>('cargar');
  const [nombre, setNombre] = useState('');

  const cart = useCotizador((s) => s.cart);
  const { data: plantillas, isLoading } = usePlantillas();
  const crear = useCrearPlantilla();
  const borrar = useBorrarPlantilla();
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    function onOpen() { setOpen(true); setModo('cargar'); }
    window.addEventListener('cot:open-plantillas', onOpen);
    return () => window.removeEventListener('cot:open-plantillas', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function onGuardar() {
    if (!nombre.trim()) {
      toast({ kind: 'error', title: 'Falta nombre', description: 'Dale un nombre a la plantilla.' });
      return;
    }
    if (cart.length === 0) {
      toast({ kind: 'error', title: 'Carrito vacío', description: 'Agrega al menos una línea antes de guardar.' });
      return;
    }
    try {
      // Plantillas solo soportan líneas de catálogo (producto_id != null).
      // Las fantasmas no se guardan en plantillas — son ad-hoc por naturaleza.
      const lineasCatalogo = cart.filter((i): i is typeof i & { producto_id: number } => i.producto_id != null);
      if (lineasCatalogo.length === 0) {
        toast({ kind: 'error', title: 'Sin líneas guardables', description: 'Las plantillas solo soportan productos del catálogo. Agrega al menos uno.' });
        return;
      }
      await crear.mutateAsync({
        nombre: nombre.trim(),
        lineas: lineasCatalogo.map((i) => ({
          producto_id: i.producto_id,
          qty: i.qty,
          utilidad: i.utilidad,
          descuento: i.descuento,
          entrega_min: i.entrega_min,
          entrega_max: i.entrega_max,
          entrega_unidad: i.entrega_unidad,
          observaciones_linea: i.observaciones_linea,
        })),
      });
      toast({ kind: 'success', title: 'Plantilla guardada', description: `"${nombre.trim()}"` });
      setNombre('');
      setModo('cargar');
    } catch (e) {
      const err = e as ApiError;
      toast({ kind: 'error', title: 'No se pudo guardar', description: err.detail });
    }
  }

  async function onCargar(p: Plantilla) {
    if (
      useCotizador.getState().cart.length > 0 &&
      !(await confirm({ mensaje: 'Cargar esta plantilla reemplazará el carrito actual. ¿Continuar?', tono: 'warning' }))
    ) {
      return;
    }
    const { reset, addProducto, updateLinea } = useCotizador.getState();
    reset();
    let cargadas = 0;
    let faltantes = 0;
    for (const l of p.lineas) {
      // Plantillas solo guardan líneas de catálogo (ver guarda al guardar);
      // si una línea quedó sin producto_id (fantasma/servicio legacy), se omite.
      if (l.producto_id == null) { faltantes += 1; continue; }
      const prod = await fetchProductoById(l.producto_id);
      if (!prod) { faltantes += 1; continue; }
      addProducto(prod, l.qty, l.utilidad);
      // aplicar overrides remanentes (utilidad ya se aplicó vía addProducto)
      const uid = useCotizador.getState().cart.slice(-1)[0]?.uid;
      if (uid) {
        updateLinea(uid, {
          descuento: l.descuento,
          entrega_min: l.entrega_min,
          entrega_max: l.entrega_max,
          entrega_unidad: l.entrega_unidad,
          observaciones_linea: l.observaciones_linea,
        });
      }
      cargadas += 1;
    }
    if (cargadas > 0) {
      toast({
        kind: 'success',
        title: `Plantilla "${p.nombre}" cargada`,
        description: faltantes > 0 ? `${cargadas} línea(s) cargada(s), ${faltantes} producto(s) ya no existe(n).` : undefined,
      });
    } else {
      toast({ kind: 'error', title: 'No se cargó nada', description: 'Los productos referenciados ya no existen.' });
    }
    setOpen(false);
  }

  async function onBorrar(p: Plantilla) {
    if (!(await confirm({ mensaje: `Borrar plantilla "${p.nombre}"?`, tono: 'danger' }))) return;
    try {
      await borrar.mutateAsync(p.id);
      toast({ kind: 'success', title: 'Plantilla borrada' });
    } catch (e) {
      const err = e as ApiError;
      toast({ kind: 'error', title: 'No se pudo borrar', description: err.detail });
    }
  }

  if (!open) return null;
  return (
    <div data-overlay className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="plantillas-title" className="bg-card border border-border rounded-xl shadow-2xl max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 id="plantillas-title" className="text-lg font-semibold flex items-center gap-2">
            <Folder className="h-4 w-4 text-accent-glow" /> Plantillas
          </h3>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border mb-3">
          <button
            type="button"
            onClick={() => setModo('cargar')}
            className={`px-3 py-1.5 text-sm border-b-2 ${modo === 'cargar' ? 'text-accent-glow border-accent-glow' : 'text-muted-foreground border-transparent'}`}
          >
            Cargar
          </button>
          <button
            type="button"
            onClick={() => setModo('guardar')}
            className={`px-3 py-1.5 text-sm border-b-2 ${modo === 'guardar' ? 'text-accent-glow border-accent-glow' : 'text-muted-foreground border-transparent'}`}
          >
            Guardar carrito actual
          </button>
        </div>

        {modo === 'cargar' && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {isLoading && <div className="text-xs text-muted-foreground text-center p-4">Cargando…</div>}
            {!isLoading && (plantillas?.length ?? 0) === 0 && (
              <div className="text-xs text-muted-foreground text-center p-4">Aún no tienes plantillas</div>
            )}
            {(plantillas ?? []).map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded hover:bg-surface-2/60 border border-border">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.n_lineas} línea(s) · {p.es_global ? 'Global' : 'Personal'}
                    {p.descripcion ? ` · ${p.descripcion}` : ''}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onCargar(p)}>Cargar</Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={borrar.isPending}
                  onClick={() => onBorrar(p)}
                  title={p.es_propia ? 'Borrar plantilla' : 'Solo el dueño o un admin puede borrar'}
                >
                  <Trash2 className="h-3 w-3 text-rose-400" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {modo === 'guardar' && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Nombre</label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Kit arranque industrial" />
            </div>
            <div className="text-xs text-muted-foreground">
              Se guardará el carrito actual: <strong>{cart.length}</strong> línea(s).
            </div>
            <Button
              onClick={onGuardar}
              disabled={crear.isPending || !nombre.trim() || cart.length === 0}
              className="w-full"
            >
              <Save className="h-3.5 w-3.5 mr-2" /> {crear.isPending ? 'Guardando…' : 'Guardar plantilla'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
