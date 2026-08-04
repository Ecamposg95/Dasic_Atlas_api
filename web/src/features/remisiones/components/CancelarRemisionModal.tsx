import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { useCancelar } from '../hooks/useRemisiones';

// Motivo obligatorio antes de cancelar — mismo patrón que
// `features/inventario/components/AjusteStockModal.tsx` (Textarea +
// validación local antes de disparar la mutación). Solo aplica a
// EMITIDA/RECIBIDA — el service (`app/domains/remisiones/service.py`)
// rechaza cancelar un BORRADOR o una ya CANCELADA.
type Props = {
  remisionId: number;
  folio: string | null;
  onClose: () => void;
  onCancelada?: () => void;
};

export function CancelarRemisionModal({ remisionId, folio, onClose, onCancelada }: Props) {
  const [motivo, setMotivo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const cancelar = useCancelar();

  function onSubmit() {
    setErr(null);
    if (!motivo.trim()) {
      setErr('El motivo es obligatorio.');
      return;
    }
    cancelar.mutate(
      { id: remisionId, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast({ kind: 'success', title: `Remisión ${folio ?? ''} cancelada` });
          onCancelada?.();
          onClose();
        },
        onError: (e) => {
          const detail = (e as { status?: number; detail?: string }).detail ?? 'No se pudo cancelar la remisión';
          if ((e as { status?: number }).status === 401) { window.location.href = '/spa/login'; return; }
          toast({ kind: 'error', title: detail });
        },
      },
    );
  }

  return (
    <Modal title={`Cancelar remisión — ${folio ?? 'sin folio'}`} onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          La remisión quedará marcada como CANCELADA y el motivo quedará visible en su detalle. Esta acción no se
          puede deshacer.
        </p>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Motivo *</label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Describe el motivo de la cancelación…"
            rows={3}
            autoFocus
          />
        </div>
        {err && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">
            {err}
          </div>
        )}
      </div>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={cancelar.isPending}>
          Volver
        </Button>
        <Button variant="destructive" size="sm" onClick={onSubmit} disabled={cancelar.isPending}>
          {cancelar.isPending ? 'Cancelando…' : 'Cancelar remisión'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
