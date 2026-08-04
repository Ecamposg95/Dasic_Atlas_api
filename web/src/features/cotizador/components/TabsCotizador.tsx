import { Edit3, History } from 'lucide-react';

export type CotizadorTab = 'editor' | 'historial';

export function TabsCotizador({
  active,
  onChange,
  countHistorial,
}: {
  active: CotizadorTab;
  onChange: (t: CotizadorTab) => void;
  countHistorial?: number;
}) {
  return (
    <div role="tablist" className="flex items-center gap-1 border-b-2 border-border bg-surface-2/60 rounded-t-md px-1 -mt-2 mb-4">
      <button
        type="button"
        role="tab"
        aria-selected={active === 'editor'}
        onClick={() => onChange('editor')}
        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-[2px] ${
          active === 'editor'
            ? 'text-accent-glow border-accent-glow'
            : 'text-muted-foreground border-transparent hover:text-foreground'
        }`}
      >
        <Edit3 className="h-4 w-4" /> Cotizador
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === 'historial'}
        onClick={() => onChange('historial')}
        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-[2px] ${
          active === 'historial'
            ? 'text-accent-glow border-accent-glow'
            : 'text-muted-foreground border-transparent hover:text-foreground'
        }`}
      >
        <History className="h-4 w-4" /> Historial
        {countHistorial != null && countHistorial > 0 && (
          <span className="text-[10px] bg-border-strong text-foreground rounded-full px-2 py-0.5">
            {countHistorial}
          </span>
        )}
      </button>
    </div>
  );
}
