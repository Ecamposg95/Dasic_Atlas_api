import { useState } from 'react';
import { ClipboardList, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { useRemisiones } from '../hooks/useRemisiones';

function fmtDate(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  } catch {
    return s;
  }
}

// Drawer de borradores de remisión — patrón del DrawerBorradores del
// cotizador, pero controlado por props (open/onClose/onOpen) en vez de
// CustomEvents, y montado condicionalmente para no disparar el query con el
// drawer cerrado.
export function DrawerBorradoresRemision({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  if (!open) return null;
  return <DrawerBorradoresRemisionInner onClose={onClose} onOpen={onOpen} />;
}

function DrawerBorradoresRemisionInner({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useRemisiones(page, '', { estado: 'borrador' });

  const items = data?.items ?? [];
  const pageSize = data?.page_size ?? 50;
  const total = data?.total ?? 0;
  const hayMas = page * pageSize < total;

  return (
    // `data-overlay` marca overlay abierto (misma convención que el cotizador).
    <div data-overlay className="contents">
      <Drawer
        size="md"
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-accent-glow" /> Borradores de remisión
          </span>
        }
        footer={
          <div className="flex w-full items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Anterior
            </Button>
            <span className="text-[10px] text-muted-foreground">Página {page}</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hayMas}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente →
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {isLoading && (
            <div className="text-xs text-muted-foreground text-center p-4">Cargando…</div>
          )}
          {!isLoading && items.length === 0 && (
            <div className="text-xs text-muted-foreground text-center p-4">
              No tienes borradores de remisión
            </div>
          )}
          {items.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onOpen(b.id)}
              className="block w-full text-left p-3 rounded border border-border hover:border-accent-glow bg-background transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-bold text-accent-glow">
                  Borrador #{b.id}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {fmtDate(b.fecha_remision)}
                </span>
              </div>
              <div className="text-sm text-foreground truncate">
                {b.cliente_nombre ?? 'Sin cliente'}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {b.orden_folio ?? 'Libre (sin orden)'}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {b.lineas_count} línea(s)
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
