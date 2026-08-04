import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export type ConfirmTono = 'warning' | 'danger';
export type ConfirmOpts = {
  titulo?: string;
  mensaje: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tono?: ConfirmTono;
};
type ConfirmDetail = ConfirmOpts & { resolve: (v: boolean) => void };

/** Confirmación con modal de advertencia. Espeja `toast()` (event-based).
 *  Uso: `if (await confirm({ mensaje: '¿Seguro?', tono: 'danger' })) { ... }` */
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent<ConfirmDetail>('app:confirm', { detail: { ...opts, resolve } }));
  });
}

export function ConfirmHost() {
  const [current, setCurrent] = useState<ConfirmDetail | null>(null);

  useEffect(() => {
    function onConfirm(e: Event) {
      const detail = (e as CustomEvent<ConfirmDetail>).detail;
      setCurrent((prev) => {
        if (prev) prev.resolve(false); // no se apilan: el previo se cancela
        return detail;
      });
    }
    window.addEventListener('app:confirm', onConfirm);
    return () => window.removeEventListener('app:confirm', onConfirm);
  }, []);

  if (!current) return null;
  const tono = current.tono ?? 'warning';
  const accent = tono === 'danger' ? 'text-rose-500' : 'text-amber-500';
  const titulo = current.titulo ?? (tono === 'danger' ? 'Confirmar acción' : 'Advertencia');

  const close = (result: boolean) => {
    current.resolve(result);
    setCurrent(null);
  };

  return (
    <Modal title={titulo} onClose={() => close(false)} size="sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className={`h-6 w-6 shrink-0 ${accent}`} />
        <p className="text-sm text-muted-foreground whitespace-pre-line">{current.mensaje}</p>
      </div>
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={() => close(false)}>{current.cancelLabel ?? 'Cancelar'}</Button>
        <Button
          variant={tono === 'danger' ? 'destructive' : 'default'}
          size="sm"
          onClick={() => close(true)}
        >
          {current.confirmLabel ?? 'Confirmar'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
