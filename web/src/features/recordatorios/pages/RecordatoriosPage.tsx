import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CheckCircle2, Clock, Trash2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StatusTone } from '@/lib/status-tones';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import {
  DataTable,
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableEmpty,
} from '@/components/ui/data-table';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { normalizeDetail } from '@/lib/api';
import { RecordatorioFormModal } from '../components/RecordatorioFormModal';
import { useRecordatorios } from '../hooks/useRecordatorios';
import {
  useCompletarRecordatorio,
  usePosponerRecordatorio,
  useEliminarRecordatorio,
} from '../hooks/useRecordatorioMutations';
import type { Recordatorio, RecordatorioVista, TipoAccion } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DiasBadge({ dias }: { dias: number }) {
  if (dias < 0)
    return (
      <Badge variant="rose">
        vencido {Math.abs(dias)}d
      </Badge>
    );
  if (dias === 0) return <Badge variant="amber">hoy</Badge>;
  return <Badge variant="slate">en {dias}d</Badge>;
}

const TIPO_LABEL: Record<TipoAccion, string> = {
  llamada: 'Llamada',
  email: 'Email',
  whatsapp: 'WhatsApp',
  visita: 'Visita',
  otro: 'Otro',
};

type BadgeVariant = 'cyan' | 'amber' | 'emerald' | 'rose' | 'violet' | 'slate' | 'default';

function tipoBadgeVariant(tipo: TipoAccion): BadgeVariant {
  const map: Record<TipoAccion, BadgeVariant> = {
    llamada: 'cyan',
    email: 'slate',
    whatsapp: 'emerald',
    visita: 'violet',
    otro: 'slate',
  };
  return map[tipo] ?? 'slate';
}

function estadoBadge(estado: Recordatorio['estado']): { label: string; tone: StatusTone } {
  if (estado === 'completado') return { label: 'Completado', tone: 'success' };
  if (estado === 'pospuesto') return { label: 'Pospuesto', tone: 'warning' };
  return { label: 'Pendiente', tone: 'info' };
}

// ─── Vista tabs ────────────────────────────────────────────────────────────────

const VISTAS: { value: RecordatorioVista; label: string }[] = [
  { value: 'vencidos', label: 'Vencidos' },
  { value: 'hoy', label: 'Hoy' },
  { value: 'proximos', label: 'Próximos' },
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'todos', label: 'Todos' },
];

const EMPTY_MESSAGES: Record<RecordatorioVista, string> = {
  vencidos: 'Sin recordatorios vencidos.',
  hoy: 'No hay recordatorios para hoy.',
  proximos: 'Sin recordatorios próximos.',
  pendientes: 'Sin recordatorios pendientes.',
  todos: 'No hay recordatorios registrados.',
};

// ─── Posponer modal ────────────────────────────────────────────────────────────

function PosponerModal({ rec, onClose }: { rec: Recordatorio; onClose: () => void }) {
  const [nuevaFecha, setNuevaFecha] = useState('');
  const posponer = usePosponerRecordatorio();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaFecha) {
      toast({ kind: 'error', title: 'Selecciona la nueva fecha' });
      return;
    }
    try {
      await posponer.mutateAsync({ id: rec.id, nueva_fecha: new Date(nuevaFecha).toISOString() });
      toast({ kind: 'success', title: 'Recordatorio pospuesto' });
      onClose();
    } catch (err) {
      const detail = (err as { detail?: unknown })?.detail;
      toast({ kind: 'error', title: 'Error al posponer', description: normalizeDetail(detail, 'Error desconocido') });
    }
  }

  return (
    <Modal title="Posponer recordatorio" onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {rec.folio ? `${rec.folio} — ` : ''}{rec.cliente ?? ''}
        </p>
        <div className="space-y-1">
          <label className="text-sm font-medium text-foreground" htmlFor="posponer-fecha">
            Nueva fecha de contacto <span className="text-rose-500">*</span>
          </label>
          <Input
            id="posponer-fecha"
            type="datetime-local"
            value={nuevaFecha}
            onChange={(e) => setNuevaFecha(e.target.value)}
            required
          />
        </div>
        <ModalFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={posponer.isPending}>
            {posponer.isPending ? 'Guardando…' : 'Posponer'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── RecordatoriosPage ─────────────────────────────────────────────────────────

export function RecordatoriosPage() {
  const [vista, setVista] = useState<RecordatorioVista>('pendientes');
  const [posponerRec, setPosponerRec] = useState<Recordatorio | null>(null);
  const [crearOpen, setCrearOpen] = useState(false);

  const { data, isLoading, isPlaceholderData } = useRecordatorios(vista);
  const completar = useCompletarRecordatorio();
  const eliminar = useEliminarRecordatorio();

  async function handleCompletar(rec: Recordatorio) {
    try {
      await completar.mutateAsync(rec.id);
      toast({ kind: 'success', title: 'Recordatorio completado' });
    } catch (err) {
      const detail = (err as { detail?: unknown })?.detail;
      toast({ kind: 'error', title: 'Error', description: normalizeDetail(detail, 'Error desconocido') });
    }
  }

  async function handleEliminar(rec: Recordatorio) {
    if (
      !(await confirm({
        mensaje: `¿Eliminar este recordatorio${rec.folio ? ` de ${rec.folio}` : ''}?`,
        tono: 'danger',
      }))
    )
      return;
    try {
      await eliminar.mutateAsync(rec.id);
      toast({ kind: 'success', title: 'Recordatorio eliminado' });
    } catch (err) {
      const detail = (err as { detail?: unknown })?.detail;
      toast({ kind: 'error', title: 'Error', description: normalizeDetail(detail, 'Error desconocido') });
    }
  }

  const rows = data ?? [];

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-4">
        {/* Header */}
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <BellRing className="h-6 w-6 text-accent-glow" /> Recordatorios
            </span>
          }
          actions={
            /* Recordatorio libre (sin orden); para atarlo a una cotización, usa Seguimiento. */
            <Button size="sm" onClick={() => setCrearOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Nuevo recordatorio
            </Button>
          }
        />

        {/* Tab filter */}
        <Tabs
          tabs={VISTAS.map((v) => ({ key: v.value, label: v.label }))}
          value={vista}
          onChange={setVista}
        />

        {/* Loading */}
        {isLoading && (
          <div className="text-sm text-muted-foreground py-4">Cargando recordatorios…</div>
        )}

        {/* Table */}
        {!isLoading && (
          <div className={isPlaceholderData ? 'opacity-60 pointer-events-none' : ''}>
            <DataTable maxBodyHeight="calc(100vh - 18rem)">
              <DataTableHead sticky>
                <tr>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Vencimiento</th>
                  <th className="px-4 py-3 text-left">Folio</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Descripción</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Usuario</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {rows.length === 0 ? (
                  <DataTableEmpty colSpan={8}>{EMPTY_MESSAGES[vista]}</DataTableEmpty>
                ) : (
                  rows.map((rec) => {
                    const muted = rec.estado === 'completado';
                    const { label: estLabel, tone: estTone } = estadoBadge(rec.estado);
                    return (
                      <DataTableRow
                        key={rec.id}
                        className={muted ? 'opacity-50' : undefined}
                      >
                        {/* Vencimiento */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                              {formatDatetime(rec.fecha_proximo_contacto)}
                            </span>
                            <DiasBadge dias={rec.dias} />
                          </div>
                        </td>

                        {/* Folio */}
                        <td className="px-4 py-3">
                          {rec.folio ? (
                            <Link
                              to="/spa/seguimiento"
                              className="font-mono text-xs text-accent-deep dark:text-accent-glow hover:underline"
                            >
                              {rec.folio}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Cliente */}
                        <td className="px-4 py-3 text-sm text-foreground max-w-[160px] truncate" title={rec.cliente ?? ''}>
                          {rec.cliente ?? <span className="text-muted-foreground">—</span>}
                        </td>

                        {/* Tipo */}
                        <td className="px-4 py-3">
                          <Badge variant={tipoBadgeVariant(rec.tipo_accion)}>
                            {TIPO_LABEL[rec.tipo_accion] ?? rec.tipo_accion}
                          </Badge>
                        </td>

                        {/* Descripción */}
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate" title={rec.descripcion ?? ''}>
                          {rec.descripcion ?? '—'}
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3">
                          <StatusBadge tone={estTone} label={estLabel} />
                        </td>

                        {/* Usuario */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {rec.usuario_nombre ?? '—'}
                        </td>

                        {/* Acciones */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {/* Completar */}
                            {rec.estado !== 'completado' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Marcar como completado"
                                className="h-7 w-7 text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
                                disabled={completar.isPending}
                                onClick={() => handleCompletar(rec)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Posponer */}
                            {rec.estado !== 'completado' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Posponer"
                                className="h-7 w-7 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400"
                                onClick={() => setPosponerRec(rec)}
                              >
                                <Clock className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Eliminar */}
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Eliminar"
                              className="h-7 w-7 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                              disabled={eliminar.isPending}
                              onClick={() => handleEliminar(rec)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </DataTableRow>
                    );
                  })
                )}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </div>

      {/* Posponer modal */}
      {posponerRec && (
        <PosponerModal rec={posponerRec} onClose={() => setPosponerRec(null)} />
      )}

      {/* Crear recordatorio libre (sin orden) */}
      {crearOpen && (
        <RecordatorioFormModal onClose={() => setCrearOpen(false)} />
      )}
    </div>
  );
}
