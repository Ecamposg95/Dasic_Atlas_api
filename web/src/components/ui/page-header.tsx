import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// Encabezado estándar de página: título + contexto + acciones.
// Toda página del sistema debería abrir con esto para unificar jerarquía visual.
// `backTo` agrega navegación de regreso (vistas de detalle).
// `children` es el slot para filtros/toolbar debajo del encabezado.

export function PageHeader({
  title,
  description,
  backTo,
  backLabel,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  backTo?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('mb-5', className)}>
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 mb-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLabel ?? 'Volver'}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground tracking-tight truncate">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
