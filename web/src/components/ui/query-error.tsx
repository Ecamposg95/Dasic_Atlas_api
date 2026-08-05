import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Estado de error de una consulta, con reintento.
 *
 * Existe porque el error era el único eje sin cobertura: 32 de 35 páginas no
 * miraban `isError`, así que una consulta caída se veía **idéntica a "sin
 * datos"** —una tabla vacía, indefinidamente— y el usuario concluía que no
 * había registros. El `ErrorBoundary` global no ayuda: no captura fallos de
 * TanStack Query, que son valores de estado y no excepciones de render.
 *
 * Dos formas, porque los listados renderizan dentro de un `<tbody>` y ahí no
 * cabe un `<div>`:
 *
 *   <QueryError error={error} onRetry={refetch} />
 *   <QueryError error={error} onRetry={refetch} asRow colSpan={7} />
 *
 * No sustituye a `EmptyState`: vacío y roto son cosas distintas, y
 * confundirlas es justamente el defecto que esto corrige.
 */
export function QueryError({
  error,
  onRetry,
  title,
  asRow = false,
  colSpan = 1,
  className,
}: {
  error?: unknown;
  onRetry?: () => void;
  /** Encabezado. Por defecto uno genérico y honesto. */
  title?: string;
  /** Renderiza como `<tr>` para usarse dentro de un `<tbody>`. */
  asRow?: boolean;
  colSpan?: number;
  className?: string;
}) {
  const status = (error as { status?: number } | undefined)?.status;
  const detalle = (error as { detail?: string } | undefined)?.detail;

  // Un 403 no es un fallo: es una respuesta. Decir "no se pudieron cargar" ahí
  // manda a la gente a reintentar algo que nunca va a funcionar.
  const esPermiso = status === 403;
  const encabezado = title ?? (esPermiso ? 'No tienes acceso a esta información' : 'No se pudieron cargar los datos');
  const descripcion = esPermiso
    ? 'Si crees que deberías verla, pídele acceso a un administrador.'
    : detalle || 'Puede ser una falla temporal de conexión con el servidor.';

  const contenido = (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-10', className)}>
      <div className="h-12 w-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center mb-4">
        <AlertTriangle className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{encabezado}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{descripcion}</p>
      {onRetry && !esPermiso && (
        <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Reintentar
        </Button>
      )}
    </div>
  );

  if (asRow) {
    return (
      <tr>
        <td colSpan={colSpan} role="alert">
          {contenido}
        </td>
      </tr>
    );
  }
  return <div role="alert">{contenido}</div>;
}
