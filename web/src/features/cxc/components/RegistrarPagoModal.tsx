// Modal para registrar un pago distribuido (FIFO) a un cliente.

import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
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
        <FormField
          label="Monto (MXN)"
          required
          hint="Se distribuirá automáticamente en orden FIFO (más antiguo primero)."
        >
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
        </FormField>

        {/* Descripción */}
        <FormField label="Descripción (opcional)">
          <Input
            type="text"
            placeholder="Referencia, número de transferencia…"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            disabled={mutation.isPending}
          />
        </FormField>

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
