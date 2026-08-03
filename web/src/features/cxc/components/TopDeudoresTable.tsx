// Tabla de top deudores con acciones por fila.

import { useState } from 'react';
import { FileText, CreditCard, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import { RegistrarPagoModal } from './RegistrarPagoModal';
import { useIsAdminOrGerente } from '@/lib/permissions';
import type { TopDeudor } from '../types';

function fmtMXN(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DiasBadge({ dias }: { dias: number }) {
  if (dias > 90) return <Badge variant="rose">{dias}d</Badge>;
  if (dias > 60) return <Badge variant="amber">{dias}d</Badge>;
  if (dias > 30) return <Badge variant="amber">{dias}d</Badge>;
  return <Badge variant="slate">{dias}d</Badge>;
}

interface PagoModal {
  clienteId: number;
  nombreEmpresa: string;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-surface-2 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

interface Props {
  deudores: TopDeudor[];
  loading: boolean;
}

export function TopDeudoresTable({ deudores, loading }: Props) {
  const [pagoModal, setPagoModal] = useState<PagoModal | null>(null);
  const canPay = useIsAdminOrGerente();

  return (
    <>
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="px-4 py-3 text-left">Empresa</th>
            <th className="px-4 py-3 text-right">Saldo</th>
            <th className="px-4 py-3 text-left">Días máx. atraso</th>
            <th className="px-4 py-3 text-right"># Cargos</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : deudores.length === 0 ? (
            <DataTableEmpty colSpan={5}>
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Users className="h-10 w-10 opacity-30" />
                <p>Sin cuentas por cobrar</p>
              </div>
            </DataTableEmpty>
          ) : (
            deudores.map((d) => (
              <DataTableRow key={d.cliente_id}>
                {/* Empresa */}
                <td className="px-4 py-3 text-foreground text-sm font-medium">
                  {d.nombre_empresa}
                </td>

                {/* Saldo */}
                <td className="px-4 py-3 text-right tabular-nums text-foreground font-medium text-sm">
                  ${fmtMXN(d.saldo)}
                </td>

                {/* Días */}
                <td className="px-4 py-3">
                  <DiasBadge dias={d.dias_max_atraso} />
                </td>

                {/* Cargos */}
                <td className="px-4 py-3 text-right text-muted-foreground text-sm tabular-nums">
                  {d.n_cargos_abiertos}
                </td>

                {/* Acciones */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Estado de cuenta"
                      onClick={() =>
                        window.open(
                          `/api/clientes/${d.cliente_id}/pdf-estado-cuenta`,
                          '_blank',
                        )
                      }
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span className="ml-1 hidden sm:inline">Estado</span>
                    </Button>
                    {canPay && (
                      <Button
                        size="sm"
                        variant="secondary"
                        title="Registrar pago"
                        onClick={() =>
                          setPagoModal({
                            clienteId: d.cliente_id,
                            nombreEmpresa: d.nombre_empresa,
                          })
                        }
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        <span className="ml-1 hidden sm:inline">Pago</span>
                      </Button>
                    )}
                  </div>
                </td>
              </DataTableRow>
            ))
          )}
        </DataTableBody>
      </DataTable>

      {pagoModal && (
        <RegistrarPagoModal
          clienteId={pagoModal.clienteId}
          nombreEmpresa={pagoModal.nombreEmpresa}
          onClose={() => setPagoModal(null)}
        />
      )}
    </>
  );
}
