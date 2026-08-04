// Modal para registrar un pago distribuido (FIFO) a un cliente.

import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { normalizeDetail } from '@/lib/api';
import { usePagoDistribuido } from '../hooks/usePagoDistribuido';

interface Props {
  clienteId: number;
  nombreEmpresa: string;
  onClose: () => void;
}

function fmtMXN(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RegistrarPagoModal({ clienteId, nombreEmpresa, onClose }: Props) {
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const mutation = usePagoDistribuido(clienteId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const montoNum = parseFloat(monto);
    if (!monto || isNaN(montoNum) || montoNum <= 0) {
      toast({ kind: 'error', title: 'Ingresa un monto válido mayor a 0' });
      return;
    }

    mutation.mutate(
      {
        monto: montoNum,
        descripcion: descripcion.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          const lines: string[] = [
            `Aplicado: $${fmtMXN(data.monto_aplicado)} MXN`,
          ];
          if (data.monto_excedente > 0) {
            lines.push(`Excedente (saldo a favor): $${fmtMXN(data.monto_excedente)} MXN`);
          }
          toast({ kind: 'success', title: lines.join(' · ') });
          onClose();
        },
        onError: (err) => {
          const e = err as { status?: number; detail?: unknown };
          if (e.status === 403) {
            toast({ kind: 'error', title: 'Sin permiso para registrar pagos' });
          } else {
            toast({
              kind: 'error',
              title: normalizeDetail(e.detail, 'Error al registrar el pago'),
            });
          }
        },
      },
    );
  }

  return (
    <Modal title={`Registrar pago — ${nombreEmpresa}`} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Monto */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground uppercase tracking-wide">
            Monto (MXN) <span className="text-rose-500">*</span>
          </label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            disabled={mutation.isPending}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Se distribuirá automáticamente en orden FIFO (más antiguo primero).
          </p>
        </div>

        {/* Descripción */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground uppercase tracking-wide">
            Descripción (opcional)
          </label>
          <Input
            type="text"
            placeholder="Referencia, número de transferencia…"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Registrando…' : 'Registrar pago'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
