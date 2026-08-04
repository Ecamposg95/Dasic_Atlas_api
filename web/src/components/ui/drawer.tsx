import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Panel lateral (derecha) para vistas rápidas y edición de datos simples.
// Mismo contrato que Modal: cierra con Esc + click fuera; el consumidor
// pone su propio contenido. Unifica los drawers ad-hoc por feature.

export function Drawer({
  title, onClose, children, size = 'md', footer,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sizeCls = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          'drawer-in h-full w-full bg-card border-l border-border text-foreground shadow-elev-3 flex flex-col',
          sizeCls,
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-lg font-semibold truncate">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-border shrink-0">{footer}</div>
        )}
      </aside>
    </div>
  );
}
