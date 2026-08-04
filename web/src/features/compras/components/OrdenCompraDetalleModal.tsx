import { Modal, ModalFooter } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrdenCompraDetalle } from '../hooks/useOrdenCompraDetalle';
import type { EstatusOC } from '../types';

function fmtMoney(n: number, m: string) {
  return `${m === 'USD' ? 'US$' : '$'}${Number(n || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' });
  } catch {
    return iso;
  }
}

function badgeEstatus(e: EstatusOC) {
  const map: Record<EstatusOC, 'default' | 'amber' | 'sky' | 'emerald' | 'rose' | 'slate'> = {
    borrador: 'slate',
    enviada: 'amber',
    confirmada: 'sky',
    recibido: 'emerald',
    recibida_parcial: 'amber',
    pagado: 'emerald',
    cancelada: 'rose',
  };
  return <Badge variant={map[e] ?? 'default'}>{e}</Badge>;
}

export function OrdenCompraDetalleModal({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const { data: oc, isLoading, error } = useOrdenCompraDetalle(id);

  return (
    <Modal title="Detalle de Orden de Compra" onClose={onClose} size="xl">
      {isLoading && <div className="text-muted-foreground text-sm py-4">Cargando…</div>}
      {error && (
        <div className="text-rose-600 dark:text-rose-400 text-sm py-4">
          No se pudo cargar el detalle.
        </div>
      )}
      {oc && (
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Encabezado */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Folio</div>
              <div className="font-mono font-bold text-accent-deep dark:text-accent-glow">
                {oc.folio ?? `#${oc.id}`}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Proveedor</div>
              <div className="font-medium">{oc.proveedor ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Fecha</div>
              <div>{fmtDate(oc.fecha)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Estatus</div>
              <div>{badgeEstatus(oc.estatus)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Moneda</div>
              <div>{oc.moneda}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Tipo cambio</div>
              <div className="font-mono">{oc.tipo_cambio}</div>
            </div>
            {oc.cotizacion_id && (
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Cotización origen</div>
                <a
                  href={`/spa/cotizador?edit=${oc.cotizacion_id}`}
                  className="text-accent-deep hover:underline text-xs dark:text-accent-glow"
                  target="_blank"
                  rel="noreferrer"
                >
                  #{oc.cotizacion_id}
                </a>
              </div>
            )}
          </div>

          {/* Líneas */}
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground mb-2 tracking-wider">
              Líneas ({oc.detalles.length})
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 pr-2">SKU / Descripción</th>
                  <th className="text-center py-1.5 px-2">Cant.</th>
                  <th className="text-center py-1.5 px-2">Recibido</th>
                  <th className="text-right py-1.5 px-2">Costo unit.</th>
                  <th className="text-right py-1.5 pl-2">Importe</th>
                </tr>
              </thead>
              <tbody>
                {oc.detalles.map((d) => {
                  const sku = d.producto?.sku ?? d.sku_libre ?? '—';
                  const nombre = d.producto?.nombre ?? d.descripcion_libre ?? '—';
                  const importe = d.cantidad * d.costo_unitario;
                  return (
                    <tr key={d.id} className="border-b border-border">
                      <td className="py-1.5 pr-2">
                        <span className="font-mono text-foreground">{sku}</span>{' '}
                        <span className="text-muted-foreground">{nombre}</span>
                        {(d.clave_unidad_sat || d.clave_prod_serv) && (
                          <div className="text-[10px] font-mono text-muted-foreground">SAT {d.clave_prod_serv ?? '—'} · {d.clave_unidad_sat ?? '—'}</div>
                        )}
                      </td>
                      <td className="text-center py-1.5 px-2">{d.cantidad}</td>
                      <td className="text-center py-1.5 px-2">{d.cantidad_recibida ?? 0}/{d.cantidad}</td>
                      <td className="text-right py-1.5 px-2 font-mono">
                        {fmtMoney(d.costo_unitario, oc.moneda)}
                      </td>
                      <td className="text-right py-1.5 pl-2 font-mono font-medium">
                        {fmtMoney(importe, oc.moneda)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-end">
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-0.5">Total OC</div>
              <div className="text-lg font-bold text-accent-deep dark:text-accent-glow">
                {fmtMoney(oc.total, oc.moneda)} {oc.moneda}
              </div>
            </div>
          </div>
        </div>
      )}
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </Button>
        {oc && (
          <a
            href={`/api/compras/${oc.id}/imprimir`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface-2/70 text-sm border border-border-strong"
          >
            Imprimir
          </a>
        )}
      </ModalFooter>
    </Modal>
  );
}
