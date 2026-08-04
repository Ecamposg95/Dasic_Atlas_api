import * as React from 'react';
import { cn } from '@/lib/utils';

// Tabla genérica reutilizable para listados de seguimiento/borradores/fantasmas.
// El consumidor maneja sus propias columnas y filas — esto solo provee shell.

export function DataTable({
  className,
  maxBodyHeight,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & { maxBodyHeight?: string }) {
  // maxBodyHeight (opt-in): acota la altura y deja el scroll DENTRO de la tabla
  // (con DataTableHead sticky) para que la página no crezca sin límite.
  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl overflow-x-auto shadow-elev-1',
        maxBodyHeight && 'overflow-y-auto',
      )}
      style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
    >
      <table className={cn('w-full text-sm min-w-[640px] md:min-w-0', className)} {...props} />
    </div>
  );
}

export function DataTableHead({
  children,
  sticky,
}: {
  children: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <thead
      className={cn(
        'bg-surface-2 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border',
        sticky && 'sticky top-0 z-10',
      )}
    >
      {children}
    </thead>
  );
}

export function DataTableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function DataTableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-border hover:bg-surface-2/60 transition-colors duration-100', className)}
      {...props}
    />
  );
}

export function DataTableEmpty({ children, colSpan }: { children: React.ReactNode; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-8 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}
