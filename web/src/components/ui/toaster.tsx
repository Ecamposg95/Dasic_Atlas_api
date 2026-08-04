import { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { ToastEvent } from '@/lib/toast';
import { cn } from '@/lib/utils';

type ToastItem = ToastEvent & { id: number };

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const COLORS = {
  success: 'border-emerald-700/50 bg-emerald-900/40 text-emerald-200',
  error: 'border-rose-700/50 bg-rose-900/40 text-rose-200',
  warning: 'border-amber-700/50 bg-amber-900/40 text-amber-200',
  info: 'border-sky-700/50 bg-sky-900/40 text-sky-200',
} as const;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent<ToastEvent>;
      const id = Date.now() + Math.random();
      const item: ToastItem = { id, ...ce.detail };
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, ce.detail.kind === 'error' ? 6000 : 3500);
    }
    window.addEventListener('app:toast', onToast);
    return () => window.removeEventListener('app:toast', onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-md">
      {items.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className={cn(
              'border rounded-lg shadow-xl px-4 py-3 flex items-start gap-3 backdrop-blur',
              COLORS[t.kind],
            )}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description && <div className="text-xs mt-0.5 opacity-80">{t.description}</div>}
            </div>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-current/60 hover:text-current"
              aria-label="Cerrar"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
