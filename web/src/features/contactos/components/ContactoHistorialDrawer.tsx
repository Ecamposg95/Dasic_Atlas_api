import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useContactoHistorial } from '../hooks/useContactosGlobal';
import type { ContactoGlobal } from '../types';

function fmtMoney(n: number, moneda: string | null) {
  return `${moneda || 'MXN'} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export function ContactoHistorialDrawer({ contacto, onClose }: { contacto: ContactoGlobal | null; onClose: () => void }) {
  const { data, isLoading } = useContactoHistorial(contacto?.id ?? null);
  if (!contacto) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-md bg-card h-full overflow-y-auto p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold">{contacto.nombre}</h3>
            <p className="text-xs text-muted-foreground">{contacto.empresa_nombre}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Cotizaciones / Órdenes</h4>
        {isLoading ? (
          <p className="text-sm text-muted-foreground/70">Cargando…</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">Sin documentos para este contacto.</p>
        ) : (
          <ul className="space-y-2">
            {data.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <a href={`/spa/cotizador?edit=${o.id}`} className="font-mono text-sm text-accent-glow hover:underline">{o.folio}</a>
                  <div className="text-[11px] text-muted-foreground">{o.fecha ? o.fecha.slice(0, 10) : ''}</div>
                </div>
                <div className="text-right">
                  <Badge variant="slate">{o.estatus}</Badge>
                  <div className="text-xs font-mono mt-0.5">{fmtMoney(o.total, o.moneda)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
