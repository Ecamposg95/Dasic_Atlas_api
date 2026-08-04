import { useEffect, useRef, useState } from 'react';
import { X, FileText, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useCotizador } from '../store';
import { useConfig } from '../hooks/useConfig';

export function ModalTerminos() {
  const [open, setOpen] = useState(false);
  const setTerminos = useCotizador((s) => s.setTerminos);
  const [draft, setDraft] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);
  const { config } = useConfig();
  // El backend aún no expone `terminos_condiciones_default` (ver `types.ts`).
  // Mientras tanto, "Restaurar default" deja el textarea vacío — que es el
  // contrato actual del backend: vacío ⇒ usa defaults al renderizar el PDF.
  const defaultTerms = config.terminos_condiciones_default ?? '';

  useEffect(() => {
    function onOpen() {
      setDraft(useCotizador.getState().terminos_condiciones);
      setOpen(true);
    }
    window.addEventListener('cot:open-terminos', onOpen);
    return () => window.removeEventListener('cot:open-terminos', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const lineCount = draft.split('\n').filter((l) => l.trim()).length;

  function onSave() {
    setTerminos(draft);
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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="terminos-title" className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 id="terminos-title" className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent-glow" /> Términos y condiciones
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={12}
          placeholder="Una línea por cláusula. Vacío ⇒ usa los defaults del backend al guardar."
          className="w-full text-sm rounded border border-border-strong bg-card px-3 py-2 focus:border-accent-glow outline-none resize-none font-mono"
        />
        <div className="flex items-center justify-between mt-2">
          <div className="text-[10px] text-muted-foreground">{lineCount} cláusulas</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraft(defaultTerms)}
              title={defaultTerms ? 'Restaurar al default del sistema' : 'No hay default configurado'}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Restaurar default
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft('')}>
              <Trash2 className="h-3 w-3 mr-1" /> Vaciar
            </Button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-border">
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
