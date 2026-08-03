import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Estado vacío útil: explica por qué no hay datos y ofrece la acción siguiente.
// Usar dentro de cards/tablas cuando un listado o sección no tiene resultados;
// para celdas de tabla simples sigue existiendo DataTableEmpty.

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Botón/link de acción concreta (crear primero, limpiar filtros, etc.). */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-12', className)}>
      {Icon && (
        <div className="h-12 w-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
