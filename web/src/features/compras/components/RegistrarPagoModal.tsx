// POST /api/compras/registrar-pago?proveedor_id=X&monto=Y&ref=Z
// El endpoint usa query params (no JSON body) y requiere el proveedor_id real
// (NO el id de la OC). Como el listado /historial no expone proveedor_id, lo
// obtenemos del detalle GET /api/compras/{id}/json antes de habilitar el submit.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useOrdenCompraDetalle } from '../hooks/useOrdenCompraDetalle';
import type { OrdenCompraListItem, PagoResponse } from '../types';

type Props = {
  orden: OrdenCompraListItem;
  onClose: () => void;
};

export function RegistrarPagoModal({ orden, onClose }: Props) {
  const qc = useQueryClient();
  const [monto, setMonto] = useState('');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Necesitamos el proveedor_id real de la OC. El listado solo trae el nombre,
  // así que pedimos el detalle al abrir el modal.
  const { data: detalle, isLoading: cargandoDetalle, error: errorDetalle } =
    useOrdenCompraDetalle(orden.id);

  const proveedorId = detalle?.proveedor_id ?? null;
  const proveedorNombre = detalle?.proveedor ?? orden.proveedor;

  const mutation = useMutation<PagoResponse, { status?: number; detail?: string }>({
    mutationFn: () => {
      const montoNum = parseFloat(monto);
      if (!Number.isFinite(montoNum) || montoNum <= 0) throw new Error('Monto inválido');
      if (proveedorId == null) {
        throw new Error('No se pudo determinar el proveedor de la OC');
      }
      const params = new URLSearchParams({
        proveedor_id: String(proveedorId),
        monto: String(montoNum),
        ref: ref.trim() || `Pago OC ${orden.folio ?? orden.id}`,
      });
      return api.post<PagoResponse>(`/api/compras/registrar-pago?${params.toString()}`);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['ordenesCompra'] });
      qc.invalidateQueries({ queryKey: ['ordenCompraDetalle', orden.id] });
      toast({
        kind: 'success',
        title: 'Pago registrado',
        description: `Nuevo saldo proveedor: $${Number(data.nuevo_saldo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      });
      onClose();
    },
    onError: (e) => {
      if (e.status === 401) { window.location.href = '/spa/login'; return; }
      if (e.status === 403) {
        toast({ kind: 'error', title: 'Sin permiso', description: 'Se requiere rol admin o asistente.' });
        return;
      }
      const msg = (e as { message?: string }).message ?? (e as { detail?: string }).detail;
      setErr(msg ?? 'Error al registrar pago');
    },
  });

  function onSubmit() {
    setErr(null);
    if (proveedorId == null) {
      setErr('Aún no se ha cargado el proveedor de la OC.');
      return;
    }
    const montoNum = parseFloat(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setErr('El monto debe ser mayor que 0.');
      return;
    }
    mutation.mutate();
  }

  const detalleStatus = (errorDetalle as { status?: number } | null)?.status;
  const fallaDetalle =
    !!errorDetalle && detalleStatus !== 401 && detalleStatus !== 403;
  const submitDeshabilitado =
    mutation.isPending || cargandoDetalle || proveedorId == null;

  return (
    <Modal title="Registrar pago a proveedor" onClose={onClose} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground text-xs">
          OC: <span className="font-mono text-cyan-700 dark:text-cyan-300">{orden.folio ?? `#${orden.id}`}</span> —{' '}
          Proveedor:{' '}
          {cargandoDetalle ? (
            <span className="inline-block h-3 w-24 align-middle bg-surface-2 rounded animate-pulse" />
          ) : (
            <span className="font-medium text-foreground">{proveedorNombre}</span>
          )}
        </p>

        {fallaDetalle && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">
            No se pudo cargar el proveedor de la OC. Cierra y vuelve a intentar.
          </div>
        )}

        <FormField label={`Monto (${orden.moneda})`} required>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
          />
        </FormField>

        <FormField label="Referencia / nota">
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={`Pago OC ${orden.folio ?? orden.id}`}
          />
        </FormField>

        {err && (
          <div className="text-xs bg-rose-100 border border-rose-300 text-rose-700 dark:bg-rose-900/30 dark:border-rose-700/50 dark:text-rose-300 rounded p-2">
            {err}
          </div>
        )}
      </div>
      <ModalFooter>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={submitDeshabilitado}>
          {mutation.isPending
            ? 'Registrando…'
            : cargandoDetalle
              ? 'Cargando OC…'
              : 'Registrar pago'}
        </Button>
      </ModalFooter>
      </form>
    </Modal>
  );
}
