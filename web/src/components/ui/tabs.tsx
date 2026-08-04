import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Tabs<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: ReadonlyArray<{ key: T; label: ReactNode }>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition',
            value === t.key
              ? 'border-accent-glow text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
