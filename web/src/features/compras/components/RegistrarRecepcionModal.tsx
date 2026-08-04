// Recepción parcial incremental de OC. Tabla por línea: el usuario captura
// "recibir ahora" (delta) por línea (máx = pendiente). POST /recibir-parcial.

import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { useOrdenCompraDetalle } from '../hooks/useOrdenCompraDetalle';
import { useRecibirParcial } from '../hooks/useRecibirParcial';
import type { OrdenCompraLinea } from '../types';

type Props = {
  id: number;
  folio: string | null;
  onClose: () => void;
};

function pendiente(l: OrdenCompraLinea) {
  return l.cantidad - (l.cantidad_recibida ?? 0);
}

export function RegistrarRecepcionModal({ id, folio, onClose }: Props) {
  const { data: oc, isLoading } = useOrdenCompraDetalle(id);
  const recibir = useRecibirParcial(id);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [fecha, setFecha] = useState('');

  const lineas = oc?.detalles ?? [];

  function recibirTodo() {
    const next: Record<number, string> = {};
    lineas.forEach((l) => { const p = pendiente(l); if (p > 0) next[l.id] = String(p); });
    setCantidades(next);
  }

  function onSubmit() {
    const payloadLineas = lineas
      .map((l) => ({ detalle_compra_id: l.id, cantidad: parseInt(cantidades[l.id] ?? '0', 10) || 0 }))
      .filter((x) => x.cantidad > 0);
    if (payloadLineas.length === 0) {
      toast({ kind: 'warning', title: 'Captura al menos una cantidad a recibir' });
      return;
    }
    recibir.mutate(
      { lineas: payloadLineas, fecha: fecha || null },
      {
        onSuccess: (data) => {
          toast({
            kind: 'success',
            title: data.estatus === 'recibido' ? 'OC recibida por completo' : 'Recepción parcial registrada',
            description: `${data.procesados} línea(s) actualizada(s).`,
          });
          onClose();
        },
        onError: (e) => {
          if (e.status === 401) { window.location.href = '/spa/login'; return; }
          if (e.status === 403) { toast({ kind: 'error', title: 'Sin permiso', description: 'Se requiere rol admin o asistente.' }); return; }
          toast({ kind: 'error', title: 'Error al recibir OC', description: e.detail });
        },
      },
    );
  }

  return (
    <Modal title={`Recepción de OC ${folio ?? `#${id}`}`} onClose={onClose} size="xl">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando líneas…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <label className="text-xs text-muted-foreground">
              Fecha de recepción
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-44" />
            </label>
            <Button variant="outline" size="sm" onClick={recibirTodo}>Recibir todo lo pendiente</Button>
          </div>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground uppercase">
              <tr>
                <th className="text-left p-1.5">Descripción</th>
                <th className="p-1.5 text-center w-16">Pedido</th>
                <th className="p-1.5 text-center w-20">Recibido</th>
                <th className="p-1.5 text-center w-28">Recibir ahora</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const p = pendiente(l);
                return (
                  <tr key={l.id} className="border-t border-border">
                    <td className="p-1.5">
                      <div className="text-foreground">
                        {l.producto?.nombre ?? l.descripcion_libre ?? l.sku_libre ?? '—'}
                        {l.producto_id == null && <span className="ml-1 text-[10px] text-amber-500">fantasma</span>}
                      </div>
                      {(l.clave_unidad_sat || l.clave_prod_serv) && (
                        <div className="text-[10px] font-mono text-muted-foreground">SAT {l.clave_prod_serv ?? '—'} · {l.clave_unidad_sat ?? '—'}</div>
                      )}
                    </td>
                    <td className="p-1.5 text-center">{l.cantidad}</td>
                    <td className="p-1.5 text-center">{l.cantidad_recibida ?? 0}</td>
                    <td className="p-1.5 text-center">
                      <Input
                        type="number"
                        min="0"
                        max={p}
                        value={cantidades[l.id] ?? ''}
                        disabled={p <= 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(p, parseInt(e.target.value, 10) || 0));
                          setCantidades((s) => ({ ...s, [l.id]: String(v) }));
                        }}
                        className="h-7 w-20 text-center inline-block"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-muted-foreground">
            Las líneas de catálogo ingresan a inventario por lo recibido (kardex). Las líneas fantasma solo registran la recepción; su stock entra al promoverlas.
          </p>
        </div>
      )}
      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={recibir.isPending}>Cancelar</Button>
        <Button size="sm" onClick={onSubmit} disabled={recibir.isPending || isLoading}>
          {recibir.isPending ? 'Procesando…' : 'Registrar recepción'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
