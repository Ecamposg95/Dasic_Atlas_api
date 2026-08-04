import { useState } from 'react';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { normalizeDetail } from '@/lib/api';
import { useClientes } from '@/features/clientes/hooks/useClientes';
import { useCrearRecordatorio } from '../hooks/useRecordatorioMutations';
import type { TipoAccion } from '../types';

interface Props {
  /** Si viene, el recordatorio se ata a esta orden (flujo Seguimiento).
   *  Si es undefined, es un recordatorio "libre" y se muestra el selector de cliente. */
  ordenId?: number;
  folio?: string;
  onClose: () => void;
}

const TIPO_OPTIONS: { value: TipoAccion; label: string }[] = [
  { value: 'llamada', label: 'Llamada' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'visita', label: 'Visita' },
  { value: 'otro', label: 'Otro' },
];

export function RecordatorioFormModal({ ordenId, folio, onClose }: Props) {
  const esLibre = ordenId === undefined;
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState<TipoAccion>('llamada');
  const [descripcion, setDescripcion] = useState('');
  const [clienteId, setClienteId] = useState<number | ''>('');
  const [clienteQuery, setClienteQuery] = useState('');

  // Solo cargamos clientes en modo libre (con orden, el cliente se deriva en backend).
  const { data: clientes, isLoading: clientesLoading } = useClientes({
    q: clienteQuery,
    pageSize: 50,
    estatus: 'activo',
  });

  const crear = useCrearRecordatorio();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fecha) {
      toast({ kind: 'error', title: 'Selecciona la fecha del próximo contacto' });
      return;
    }
    // datetime-local gives local time; convert to ISO (UTC)
    const isoDate = new Date(fecha).toISOString();
    try {
      await crear.mutateAsync({
        orden_id: ordenId,
        cliente_id: esLibre && clienteId !== '' ? clienteId : undefined,
        fecha_proximo_contacto: isoDate,
        tipo_accion: tipo,
        descripcion: descripcion.trim() || undefined,
      });
      toast({ kind: 'success', title: 'Recordatorio creado' });
      onClose();
    } catch (err) {
      const detail = (err as { detail?: unknown })?.detail;
      toast({ kind: 'error', title: 'Error al crear recordatorio', description: normalizeDetail(detail, 'Error desconocido') });
    }
  }

  const titulo = folio ? `Recordatorio — ${folio}` : 'Nuevo recordatorio';

  return (
    <Modal title={titulo} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Cliente (solo recordatorio libre) */}
        {esLibre && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground" htmlFor="rec-cliente">
              Cliente <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <Input
              id="rec-cliente-q"
              type="text"
              placeholder="Buscar cliente…"
              value={clienteQuery}
              onChange={(e) => setClienteQuery(e.target.value)}
              className="mb-1.5"
            />
            <Select
              id="rec-cliente"
              value={clienteId === '' ? '' : String(clienteId)}
              onChange={(e) => setClienteId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">— Sin cliente —</option>
              {clientesLoading && <option disabled>Cargando…</option>}
              {(clientes ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_empresa}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Fecha */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="rec-fecha">
            Próximo contacto <span className="text-rose-500">*</span>
          </label>
          <Input
            id="rec-fecha"
            type="datetime-local"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>

        {/* Tipo de acción */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="rec-tipo">
            Tipo de acción
          </label>
          <Select
            id="rec-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoAccion)}
          >
            {TIPO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Descripción */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="rec-desc">
            Descripción <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <textarea
            id="rec-desc"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            placeholder="Notas para el seguimiento…"
            className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-ring/60 ring-offset-background transition-[box-shadow,border-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={crear.isPending}>
            {crear.isPending ? 'Guardando…' : 'Guardar recordatorio'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
