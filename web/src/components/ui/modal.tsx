import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/lib/useFocusTrap';

// Modal shell reutilizable. Cierra en Esc + click fuera; atrapa el foco
// dentro del diálogo y lo restaura al cerrar (useFocusTrap).
// Usar como envoltorio; el consumidor pone su propio contenido.

export function Modal({
  title, onClose, children, size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(panelRef, true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sizeCls = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('modal-in bg-card border border-border text-foreground rounded-2xl shadow-elev-3 w-full p-5 max-h-[85vh] sm:max-h-[90vh] overflow-y-auto', sizeCls)}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id={titleId} className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-border">
      {children}
    </div>
  );
}
