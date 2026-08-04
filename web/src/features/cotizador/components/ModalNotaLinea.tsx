import { useEffect, useRef, useState } from 'react';
import { X, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useCotizador } from '../store';

const MAX = 1000;

export function ModalNotaLinea() {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const updateLinea = useCotizador((s) => s.updateLinea);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    function onOpen(e: Event) {
      const ce = e as CustomEvent<{ uid: string }>;
      const it = useCotizador.getState().cart.find((x) => x.uid === ce.detail.uid);
      if (!it) return;
      setUid(ce.detail.uid);
      setTexto(it.observaciones_linea || '');
      setOpen(true);
    }
    window.addEventListener('cot:open-nota', onOpen);
    return () => window.removeEventListener('cot:open-nota', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function onSave() {
    if (!uid) return;
    updateLinea(uid, { observaciones_linea: texto.slice(0, MAX) });
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div
      data-overlay
      className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="notalinea-title" className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 id="notalinea-title" className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-accent-glow" /> Nota / productos similares
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={8}
          maxLength={MAX}
          placeholder="Texto que aparece en el PDF debajo de la línea (productos similares, condiciones, etc.)…"
          className="w-full text-sm rounded border border-border-strong bg-card px-3 py-2 focus:border-accent-glow outline-none resize-none"
        />
        <div className="text-[10px] text-muted-foreground text-right mt-1">
          {texto.length}/{MAX}
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSave}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
