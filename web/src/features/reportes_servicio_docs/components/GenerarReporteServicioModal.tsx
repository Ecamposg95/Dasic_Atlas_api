import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/toast';
import { useCrearReporteServicioDoc } from '../hooks/useReportesServicioDocs';

/**
 * Modal que crea un Reporte de Servicio (acta) a partir de una OrdenVenta.
 *
 * Se abre desde un evento window:
 *   window.dispatchEvent(new CustomEvent('cot:open-generar-reporte-servicio', {
 *     detail: { orden_venta_id: 123, folio_cot: 'COT-...' }
 *   }))
 *
 * El backend valida que la cot tenga al menos una línea de tipo servicio —
 * si no, devuelve 400 y mostramos el detail.
 */
export function GenerarReporteServicioModal() {
  const [open, setOpen] = useState(false);
  const [ordenVentaId, setOrdenVentaId] = useState<number | null>(null);
  const [folioCot, setFolioCot] = useState<string>('');
  const [tecnicoNombre, setTecnicoNombre] = useState('');
  const [clienteRecibeNombre, setClienteRecibeNombre] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const crear = useCrearReporteServicioDoc();

  useEffect(() => {
    function onOpen(e: Event) {
      const ce = e as CustomEvent<{ orden_venta_id: number; folio_cot?: string }>;
      if (!ce.detail?.orden_venta_id) return;
      setOrdenVentaId(ce.detail.orden_venta_id);
      setFolioCot(ce.detail.folio_cot ?? '');
      setTecnicoNombre('');
      setClienteRecibeNombre('');
      setObservaciones('');
      setOpen(true);
    }
    window.addEventListener('cot:open-generar-reporte-servicio', onOpen);
    return () => window.removeEventListener('cot:open-generar-reporte-servicio', onOpen);
  }, []);

  function handleSubmit() {
    if (!ordenVentaId) return;
    crear.mutate(
      {
        orden_venta_id: ordenVentaId,
        tecnico_nombre: tecnicoNombre.trim() || undefined,
        cliente_recibe_nombre: clienteRecibeNombre.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          toast({
            kind: 'success',
            title: 'Reporte de servicio creado',
            description: r.folio ? `Folio: ${r.folio}` : undefined,
          });
          setOpen(false);
        },
        onError: (err) => {
          const detail = (err as { detail?: string }).detail ?? 'Error al crear reporte';
          toast({ kind: 'error', title: detail });
        },
      },
    );
  }

  if (!open || ordenVentaId === null) return null;

  return (
    <Modal
      title={`Generar reporte de servicio${folioCot ? ` — ${folioCot}` : ''}`}
      onClose={() => setOpen(false)}
      size="md"
    >
      <div className="space-y-3">
        <p className="text-[11px] text-muted-foreground">
          Acta de servicio ejecutado. Solo aplica si la cotización tiene al menos
          una línea de tipo servicio (el backend valida y rechaza si no).
        </p>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Técnico que ejecuta
          </label>
          <Input
            value={tecnicoNombre}
            onChange={(e) => setTecnicoNombre(e.target.value)}
            placeholder="Nombre del técnico"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Persona que recibe en cliente
          </label>
          <Input
            value={clienteRecibeNombre}
            onChange={(e) => setClienteRecibeNombre(e.target.value)}
            placeholder="Nombre del contacto que recibe"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Opcional al crear. Se puede registrar después con "Registrar
            recepción" desde la lista.
          </p>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Observaciones
          </label>
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            placeholder="Notas del servicio ejecutado, hallazgos, etc."
          />
        </div>
      </div>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={crear.isPending}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={crear.isPending}>
          <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
          {crear.isPending ? 'Generando…' : 'Generar reporte'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
