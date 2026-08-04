import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Línea de tiempo vertical para actividad/eventos de negocio (deals,
// cotizaciones, pagos). Item = punto/icono + título + meta (fecha) + cuerpo.

const TONES: Record<string, string> = {
  default: 'bg-muted-foreground',
  accent: 'bg-accent-glow',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
};

export function Timeline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ol className={cn('relative space-y-5 border-l border-border pl-5 ml-2', className)}>{children}</ol>;
}

export function TimelineItem({
  icon: Icon,
  tone = 'default',
  title,
  meta,
  children,
}: {
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  title: React.ReactNode;
  /** Fecha/autor, alineado a la derecha del título. */
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative">
      <span
        className={cn(
          'absolute -left-[27px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-background',
          Icon ? 'bg-surface-2 border border-border h-6 w-6 -left-[31px] -top-0.5' : TONES[tone],
        )}
        aria-hidden="true"
      >
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm text-foreground leading-snug">{title}</p>
        {meta && <span className="text-[11px] text-muted-foreground shrink-0">{meta}</span>}
      </div>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </li>
  );
}
