import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { useContactoHistorial } from '../hooks/useContactosGlobal';
import type { ContactoGlobal } from '../types';

function fmtMoney(n: number, moneda: string | null) {
  return `${moneda || 'MXN'} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export function ContactoHistorialDrawer({ contacto, onClose }: { contacto: ContactoGlobal | null; onClose: () => void }) {
  const { data, isLoading } = useContactoHistorial(contacto?.id ?? null);
  if (!contacto) return null;
  return (
    <Drawer
      size="md"
      onClose={onClose}
      title={
        <div className="min-w-0">
          <div className="truncate">{contacto.nombre}</div>
          <p className="text-xs font-normal text-muted-foreground truncate">{contacto.empresa_nombre}</p>
        </div>
      }
    >
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
    </Drawer>
  );
}
