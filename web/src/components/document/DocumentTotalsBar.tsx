import type { ReactNode } from 'react';

export type DocStat = {
  label: ReactNode;
  value: ReactNode;
  emphasis?: 'big' | 'normal' | 'accent';
  valueClass?: string;
  statKey?: string;
};

export function DocumentTotalsBar({
  stats,
  warnings,
  trailing,
  actions,
}: {
  stats: DocStat[];
  warnings?: ReactNode;
  trailing?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 bg-card border-t border-border px-3 md:px-4 py-3">
      {warnings}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3">
        <div className="flex items-center gap-4 md:gap-6 overflow-x-auto md:flex-wrap md:overflow-visible">
          {stats.map((s, i) => (
            <div className="flex flex-col shrink-0" key={s.statKey ?? i}>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                {s.label}
              </span>
              <span
                className={
                  s.valueClass ??
                  (s.emphasis === 'big'
                    ? 'font-mono text-lg md:text-2xl font-semibold text-foreground'
                    : s.emphasis === 'accent'
                      ? 'font-mono text-lg md:text-2xl font-bold text-accent-glow'
                      : 'font-mono text-xs text-muted-foreground')
                }
              >
                {s.value}
              </span>
            </div>
          ))}
          {trailing}
        </div>
        {/* En < md las acciones apilan a ancho completo (targets táctiles);
            en md+ vuelven a la fila alineada a la derecha, como siempre. */}
        <div className="flex flex-col md:flex-row gap-2 md:justify-end">{actions}</div>
      </div>
    </div>
  );
}
