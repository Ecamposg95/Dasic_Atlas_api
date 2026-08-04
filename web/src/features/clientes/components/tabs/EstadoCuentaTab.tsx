import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import type { MonedaCredito } from '../../types';
import {
  useCxCCliente,
  useEstadoCuenta,
  useRegistrarPago,
  useOrdenesEmpresa,
} from '../../hooks/useEmpresaDetalle';

function fmtMoney(n: number | string, m: string = 'MXN') {
  return `${m} $${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

export function EstadoCuentaTab({
  clienteId,
  monedaCredito = 'MXN',
}: {
  clienteId: number;
  monedaCredito?: MonedaCredito | string;
}) {
  const { data: cxc } = useCxCCliente(clienteId);
  const { data: estadoCuenta, isLoading: edcLoading } = useEstadoCuenta(clienteId);
  const { data: ordenes, isLoading: ordenesLoading } = useOrdenesEmpresa(clienteId);
  const pago = useRegistrarPago(clienteId);

  const [montoPago, setMontoPago] = useState('');

  function onRegistrarPago() {
    const m = parseFloat(montoPago);
    if (!Number.isFinite(m) || m <= 0) { toast({ kind: 'warning', title: 'Monto inválido' }); return; }
    pago.mutate(
      { monto: m, descripcion: 'Abono a cuenta' },
      {
        onSuccess: (r) => {
          toast({ kind: 'success', title: 'Pago registrado', description: `Nuevo saldo: ${fmtMoney(r.nuevo_saldo, monedaCredito)}` });
          setMontoPago('');
        },
        onError: (e) => toast({ kind: 'error', title: 'No se pudo registrar', description: e.detail }),
      },
    );
  }

  return (
    <div className="p-1 space-y-6">
      {/* Cotizaciones / Órdenes */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cotizaciones / Órdenes</h3>
        {ordenesLoading ? (
          <p className="text-xs text-muted-foreground py-2">Cargando…</p>
        ) : (ordenes ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Sin documentos.</p>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-muted-foreground uppercase">
                <tr>
                  <th className="p-2 text-left">Folio</th>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-center">Estatus</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(ordenes ?? []).map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="p-2 font-mono">
                      <a
                        href={`/spa/cotizador?edit=${o.id}`}
                        className="text-accent-deep hover:text-accent-deep/80 dark:text-accent-glow dark:hover:text-accent-glow/80"
                      >
                        {o.folio}
                      </a>
                    </td>
                    <td className="p-2">{o.fecha ? o.fecha.slice(0, 10) : '—'}</td>
                    <td className="p-2 text-center">
                      <Badge variant="slate">{o.estatus}</Badge>
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {`${o.moneda || 'MXN'} $${Number(o.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </section>

      {/* Cuentas por cobrar */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Estado de cuenta / CxC</h3>
        <div className="flex items-end gap-2 mb-3">
          <div className="flex-1">
            <label className="block text-xs text-muted-foreground mb-1">Registrar pago (abono)</label>
            <Input type="number" min="0" step="0.01" value={montoPago} onChange={(e) => setMontoPago(e.target.value)} placeholder="Monto" />
          </div>
          <Button size="sm" onClick={onRegistrarPago} disabled={pago.isPending}>Registrar</Button>
        </div>
        <div className="rounded-md border border-border overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-2 text-muted-foreground uppercase">
              <tr>
                <th className="p-2 text-left">Folio</th>
                <th className="p-2 text-left">Vence</th>
                <th className="p-2 text-right">Pendiente</th>
                <th className="p-2 text-center">Estatus</th>
              </tr>
            </thead>
            <tbody>
              {(cxc?.cargos ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-2 font-mono">{c.folio ?? '—'}</td>
                  <td className="p-2">{c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 10) : '—'}</td>
                  <td className="p-2 text-right">{fmtMoney(c.saldo_pendiente, monedaCredito)}</td>
                  <td className="p-2 text-center">{c.estatus_pago}{c.dias_atraso > 0 ? ` (${c.dias_atraso}d)` : ''}</td>
                </tr>
              ))}
              {(cxc?.cargos ?? []).length === 0 && (
                <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">Sin cargos abiertos.</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      {/* Historial de movimientos */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Historial de movimientos</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/clientes/${clienteId}/pdf-estado-cuenta`, '_blank')}
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Descargar PDF
          </Button>
        </div>
        {edcLoading ? (
          <p className="text-xs text-muted-foreground py-2">Cargando historial…</p>
        ) : (estadoCuenta ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Sin movimientos registrados.</p>
        ) : (
          <div className="rounded-md border border-border overflow-hidden max-h-72 overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-muted-foreground uppercase">
                <tr>
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-left">Concepto</th>
                  <th className="p-2 text-center">Tipo</th>
                  <th className="p-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {(estadoCuenta ?? []).map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{t.fecha ? t.fecha.slice(0, 10) : '—'}</td>
                    <td className="p-2 max-w-[180px] truncate" title={t.descripcion}>{t.descripcion}</td>
                    <td className="p-2 text-center">
                      <Badge variant={(t.tipo || '').toUpperCase() === 'CARGO' ? 'rose' : 'emerald'}>
                        {(t.tipo || '').toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      {fmtMoney(t.monto, monedaCredito)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
