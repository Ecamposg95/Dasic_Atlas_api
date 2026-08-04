import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { CollapsibleCard } from '@/components/ui/CollapsibleCard';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import type { ApiError } from '@/lib/api';
import { useAvanceEntrega } from '@/features/remisiones/hooks/useRemisiones';
import { avancePartidaLabel, avancePartidaTone, remisionEstadoLabel, remisionEstadoTone } from '@/features/remisiones/lib/estado';
import { useCotizador } from '../store';

function fmtQty(n: number) {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtFecha(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Sección "Avance de entrega" del detalle de venta (Task 11) — consume
// `GET /api/ventas/{id}/avance-entrega` (`useAvanceEntrega`, ya existía
// desde Task 9 pero sin ningún componente que lo enchufara). Solo tiene
// sentido para una orden ya convertida a VENTA (no COTIZACION): el
// caller (`CotizadorPage`) la renderiza condicionado a `noEditable`.
export function AvanceEntregaCard({ ordenId }: { ordenId: number }) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useAvanceEntrega(ordenId);
  // El cart del cotizador trae `detalle_id` (id de DetalleOrden) para las
  // líneas ya persistidas — lo cruzamos con `detalle_orden_id` de cada
  // partida del avance para mostrar SKU/descripción en vez de solo el id.
  const cart = useCotizador((s) => s.cart);
  const porPartida = new Map(cart.filter((c) => c.detalle_id != null).map((c) => [c.detalle_id as number, c]));

  // Auth error → bounce a login, mismo patrón que `HistorialTab.tsx:93-97`
  // (hermano de esta tarjeta dentro de `CotizadorPage`).
  useEffect(() => {
    const status = (error as unknown as ApiError | undefined)?.status;
    if (status === 401) window.location.href = '/spa/login';
  }, [error]);

  return (
    <CollapsibleCard title="Avance de entrega" icon={<Truck className="h-3.5 w-3.5 text-muted-foreground" />} defaultOpen>
      {error ? (
        (error as unknown as ApiError)?.status === 401 ? (
          <div className="text-xs text-muted-foreground py-2">Redirigiendo a inicio de sesión…</div>
        ) : (
          <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-900 rounded-md px-3 py-2">
            No se pudo cargar el avance de entrega.
          </div>
        )
      ) : isLoading || !data ? (
        <div className="text-xs text-muted-foreground py-2">Cargando avance de entrega…</div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-1.5 pr-2 font-medium">Partida</th>
                  <th className="text-right py-1.5 px-2 font-medium">Cotizado</th>
                  <th className="text-right py-1.5 px-2 font-medium">Entregado</th>
                  <th className="text-right py-1.5 px-2 font-medium">Pendiente</th>
                  <th className="text-left py-1.5 pl-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.partidas.map((p) => {
                  const item = porPartida.get(p.detalle_orden_id);
                  return (
                    <tr key={p.detalle_orden_id} className="border-b border-border/60">
                      <td className="py-1.5 pr-2">
                        {item ? (
                          <>
                            <span className="font-mono text-accent-glow">{item.sku}</span>{' '}
                            <span className="text-foreground">{item.nom}</span>
                          </>
                        ) : (
                          `Partida #${p.detalle_orden_id}`
                        )}
                      </td>
                      <td className="text-right py-1.5 px-2 font-mono tabular-nums">{fmtQty(p.cotizado)}</td>
                      <td className="text-right py-1.5 px-2 font-mono tabular-nums">{fmtQty(p.entregado)}</td>
                      <td className="text-right py-1.5 px-2 font-mono tabular-nums">{fmtQty(p.pendiente)}</td>
                      <td className="py-1.5 pl-2">
                        <StatusBadge tone={avancePartidaTone(p.estado)} label={avancePartidaLabel(p.estado)} />
                      </td>
                    </tr>
                  );
                })}
                {data.partidas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-muted-foreground">
                      Sin partidas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Remisiones ({data.remisiones.length})
              </span>
              <Button size="sm" variant="outline" onClick={() => navigate(`/spa/remisiones-nueva?orden=${ordenId}`)}>
                <Truck className="h-3.5 w-3.5 mr-1" />
                Nueva remisión
              </Button>
            </div>
            {data.remisiones.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin remisiones registradas para esta orden.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {data.remisiones.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                    <Link to={`/spa/remisiones?ver=${r.id}`} className="font-mono text-accent-glow hover:underline">
                      {r.folio ?? `#${r.id} (borrador)`}
                    </Link>
                    <span className="text-muted-foreground flex-1">{fmtFecha(r.fecha)}</span>
                    <StatusBadge tone={remisionEstadoTone(r.estado)} label={remisionEstadoLabel(r.estado)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}
