import { useEffect, useState } from 'react';
import { ClipboardList, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { useBorradores } from '../hooks/useBorradores';

function fmtMoney(n: number, m: string) {
  return `${m} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  } catch {
    return s;
  }
}

export function DrawerBorradores() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useBorradores(page);

  useEffect(() => {
    function onOpen() {
      window.dispatchEvent(new CustomEvent('cot:close-preview-oc'));
      setOpen(true);
      setPage(1);
    }
    function onClose() { setOpen(false); }
    window.addEventListener('cot:open-borradores', onOpen);
    window.addEventListener('cot:close-borradores', onClose);
    return () => {
      window.removeEventListener('cot:open-borradores', onOpen);
      window.removeEventListener('cot:close-borradores', onClose);
    };
  }, []);

  if (!open) return null;

  const items = data?.items ?? [];
  // El backend no devuelve un `total` global — derivamos "hay más" del tamaño
  // de la página actual.
  const hayMas = items.length === (data?.page_size ?? 10);

  return (
    // `data-overlay` marca overlay abierto para useAtajos (suprime atajos de teclado).
    <div data-overlay className="contents">
      <Drawer
        size="md"
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-accent-glow" /> Borradores apilados
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
              No tienes borradores en curso
            </div>
          )}
          {items.map((b) => (
            <a
              key={b.id}
              href={`/ventas/cotizador?edit=${b.id}`}
              className="block p-3 rounded border border-border hover:border-accent-glow bg-background transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-bold text-accent-glow">{b.folio}</span>
                <span className="text-[10px] text-muted-foreground">
                  {fmtDate(b.actualizado_en)}
                </span>
              </div>
              <div className="text-sm text-foreground truncate">
                {b.cliente_nombre ?? 'Sin cliente'}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-xs font-bold text-accent-glow">
                  {fmtMoney(b.total, b.moneda)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {b.lineas_count} línea(s)
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </div>
              </div>
            </a>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
