import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  Bot, ExternalLink, FileText, Mail, MapPin, MessageSquarePlus, Pencil, Phone, StickyNote, Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { toast } from '@/lib/toast';
import { useCrmBoard } from '../hooks/useCrmBoard';
import { useMoveDeal } from '../hooks/useCrmDeals';
import { useCrearActividad, useDealDetalle, usePatchDealDetalle } from '../hooks/useDealDetalle';
import { DealFormModal } from '../components/DealFormModal';
import type { Actividad, ActividadTipo, Deal } from '../types';

const ACTIVIDAD_ICONS: Record<ActividadTipo, LucideIcon> = {
  nota: StickyNote,
  llamada: Phone,
  email: Mail,
  reunion: Users,
  visita: MapPin,
  sistema: Bot,
};

const TIPOS_ACTIVIDAD: Array<{ value: Exclude<ActividadTipo, 'sistema'>; label: string }> = [
  { value: 'nota', label: 'Nota' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'email', label: 'Email' },
  { value: 'reunion', label: 'Reunión' },
  { value: 'visita', label: 'Visita' },
];

function formatMonto(monto: number | string | null, moneda: string): string {
  if (monto == null || monto === '') return '—';
  const n = Number(monto);
  if (Number.isNaN(n)) return '—';
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || 'MXN'}`;
}

function formatFecha(fecha: string | null): string {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-MX');
}

export function DealDetallePage() {
  const { id } = useParams<{ id: string }>();
  const dealId = Number(id);
  const qc = useQueryClient();

  const { data: detalle, isLoading, isError } = useDealDetalle(dealId > 0 ? dealId : null);

  // Board del pipeline del deal: da las etapas para el selector y el modal.
  const { data: board } = useCrmBoard(detalle?.pipeline_id ?? null);
  const stages = useMemo(
    () => [...(board?.stages ?? [])].sort((a, b) => a.orden - b.orden),
    [board],
  );

  const moveDeal = useMoveDeal(detalle?.pipeline_id ?? null);
  const patchDeal = usePatchDealDetalle(dealId);
  const crearActividad = useCrearActividad(dealId);

  // --- Campos editables del resumen (un solo PATCH al guardar) ---
  const [probabilidad, setProbabilidad] = useState('');
  const [fechaCierre, setFechaCierre] = useState('');
  const [proximoPaso, setProximoPaso] = useState('');
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (!detalle) return;
    setProbabilidad(detalle.probabilidad != null ? String(Number(detalle.probabilidad)) : '');
    setFechaCierre(detalle.fecha_cierre_estimada ? detalle.fecha_cierre_estimada.slice(0, 10) : '');
    setProximoPaso(detalle.proximo_paso ?? '');
    setNotas(detalle.notas ?? '');
  }, [detalle]);

  // --- Form rápido de actividad ---
  const [tipoActividad, setTipoActividad] = useState<Exclude<ActividadTipo, 'sistema'>>('nota');
  const [descripcion, setDescripcion] = useState('');

  // --- Modal de edición ---
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (isError) {
      toast({ kind: 'error', title: 'No se pudo cargar la oportunidad' });
    }
  }, [isError]);

  if (!dealId || Number.isNaN(dealId)) {
    return <div className="p-6 text-sm text-muted-foreground">Oportunidad inválida.</div>;
  }

  if (isError) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <PageHeader backTo="/spa/crm" backLabel="Pipeline" title="Oportunidad" />
        <p className="text-sm text-muted-foreground">
          No se pudo cargar la oportunidad. Verifica que exista e intenta de nuevo.
        </p>
      </div>
    );
  }

  if (isLoading || !detalle) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-7 w-72 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <Card><CardHeader><Skeleton className="h-5 w-32" /></CardHeader><CardContent><SkeletonText lines={6} /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-5 w-40" /></CardHeader><CardContent><SkeletonText lines={2} /></CardContent></Card>
          </div>
          <Card><CardHeader><Skeleton className="h-5 w-28" /></CardHeader><CardContent><SkeletonText lines={8} /></CardContent></Card>
        </div>
      </div>
    );
  }

  // Deal “plano” para el modal de edición (mismos campos que usa el form).
  const dealForModal: Deal = {
    id: detalle.id,
    organization_id: null,
    pipeline_id: detalle.pipeline_id,
    stage_id: detalle.stage_id,
    titulo: detalle.titulo,
    cliente_id: detalle.cliente_id,
    orden_id: detalle.orden_id,
    monto: detalle.monto != null ? Number(detalle.monto) : null,
    moneda: detalle.moneda,
    owner_user_id: detalle.owner_user_id,
    orden_en_stage: 0,
    creado_en: detalle.creado_en,
    actualizado_en: detalle.actualizado_en,
    cerrado_en: detalle.cerrado_en,
  };

  function handleStageChange(stageId: number) {
    if (stageId === detalle!.stage_id) return;
    moveDeal.mutate(
      { id: dealId, move: { stage_id: stageId } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: ['crm', 'deal', dealId] });
          toast({ kind: 'success', title: 'Etapa actualizada' });
        },
      },
    );
  }

  function handleGuardarResumen() {
    const prob = probabilidad.trim() ? Number(probabilidad) : null;
    if (prob != null && (Number.isNaN(prob) || prob < 0 || prob > 100)) {
      toast({ kind: 'warning', title: 'Probabilidad inválida', description: 'Debe estar entre 0 y 100.' });
      return;
    }
    patchDeal.mutate(
      {
        probabilidad: prob,
        fecha_cierre_estimada: fechaCierre || null,
        proximo_paso: proximoPaso.trim() || null,
        notas: notas.trim() || null,
      },
      { onSuccess: () => toast({ kind: 'success', title: 'Cambios guardados' }) },
    );
  }

  function handleRegistrarActividad(e: React.FormEvent) {
    e.preventDefault();
    if (!descripcion.trim()) {
      toast({ kind: 'warning', title: 'La descripción es requerida' });
      return;
    }
    crearActividad.mutate(
      { tipo: tipoActividad, descripcion: descripcion.trim() },
      {
        onSuccess: () => {
          setDescripcion('');
          toast({ kind: 'success', title: 'Actividad registrada' });
        },
      },
    );
  }

  const actividades: Actividad[] = detalle.actividades ?? [];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <PageHeader
        backTo="/spa/crm"
        backLabel="Pipeline"
        title={
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{detalle.titulo}</span>
            {detalle.stage_nombre && <Badge variant="cyan">{detalle.stage_nombre}</Badge>}
          </span>
        }
        actions={
          <>
            {stages.length > 0 && (
              <Select
                value={String(detalle.stage_id)}
                onChange={(e) => handleStageChange(parseInt(e.target.value, 10))}
                disabled={moveDeal.isPending}
                className="w-44 h-9 text-sm"
                aria-label="Etapa"
              >
                {stages.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={() => setModalOpen(true)} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Columna izquierda: resumen + cotización ligada */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Cliente</dt>
                  <dd className="text-foreground">
                    {detalle.cliente_id != null ? (
                      <Link
                        to={`/spa/empresas/${detalle.cliente_id}`}
                        className="text-accent-glow hover:underline"
                      >
                        {detalle.cliente_nombre ?? `Cliente #${detalle.cliente_id}`}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Monto</dt>
                  <dd className="text-foreground font-semibold tabular-nums">
                    {formatMonto(detalle.monto, detalle.moneda)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Responsable</dt>
                  <dd className="text-foreground">{detalle.owner_nombre ?? 'Sin asignar'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground mb-0.5">Creado</dt>
                  <dd className="text-foreground">{formatFecha(detalle.creado_en)}</dd>
                </div>
              </dl>

              <div className="border-t border-border pt-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField label="Probabilidad (%)">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={probabilidad}
                      onChange={(e) => setProbabilidad(e.target.value)}
                      placeholder="0–100"
                      disabled={patchDeal.isPending}
                    />
                  </FormField>
                  <FormField label="Fecha cierre estimada">
                    <Input
                      type="date"
                      value={fechaCierre}
                      onChange={(e) => setFechaCierre(e.target.value)}
                      disabled={patchDeal.isPending}
                    />
                  </FormField>
                </div>
                <FormField label="Próximo paso">
                  <Input
                    value={proximoPaso}
                    onChange={(e) => setProximoPaso(e.target.value)}
                    placeholder="Ej. Enviar propuesta actualizada"
                    disabled={patchDeal.isPending}
                  />
                </FormField>
                <FormField label="Notas">
                  <Textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Notas internas del deal…"
                    rows={4}
                    disabled={patchDeal.isPending}
                  />
                </FormField>
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleGuardarResumen} disabled={patchDeal.isPending}>
                    {patchDeal.isPending ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Cotización ligada</CardTitle>
            </CardHeader>
            <CardContent>
              {detalle.orden_id != null ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {detalle.orden_folio ?? `Orden #${detalle.orden_id}`}
                      </span>
                      {detalle.orden_estatus && <StatusBadge status={detalle.orden_estatus} />}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                      {formatMonto(detalle.orden_total, detalle.moneda)}
                    </p>
                  </div>
                  <Link
                    to="/spa/seguimiento"
                    className="inline-flex items-center gap-1.5 text-xs text-accent-glow hover:underline shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver en seguimiento
                  </Link>
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Sin cotización ligada"
                  className="py-6"
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: actividad */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Actividad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleRegistrarActividad} className="space-y-3">
              <div className="flex gap-3">
                <FormField label="Tipo" className="w-36 shrink-0">
                  <Select
                    value={tipoActividad}
                    onChange={(e) => setTipoActividad(e.target.value as Exclude<ActividadTipo, 'sistema'>)}
                    disabled={crearActividad.isPending}
                  >
                    {TIPOS_ACTIVIDAD.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Descripción" className="flex-1">
                  <Textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="¿Qué pasó con este deal?"
                    rows={2}
                    className="min-h-[38px]"
                    disabled={crearActividad.isPending}
                  />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={crearActividad.isPending} className="gap-1.5">
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  {crearActividad.isPending ? 'Registrando…' : 'Registrar'}
                </Button>
              </div>
            </form>

            {actividades.length === 0 ? (
              <EmptyState
                icon={StickyNote}
                title="Sin actividad registrada"
                description="Registra la primera nota, llamada o reunión de este deal."
                className="py-8"
              />
            ) : (
              <Timeline>
                {actividades.map((a) => (
                  <TimelineItem
                    key={a.id}
                    icon={ACTIVIDAD_ICONS[a.tipo] ?? StickyNote}
                    tone={a.tipo === 'sistema' ? 'accent' : 'default'}
                    title={a.descripcion}
                    meta={[formatFecha(a.creado_en), a.usuario_nombre].filter(Boolean).join(' · ')}
                  />
                ))}
              </Timeline>
            )}
          </CardContent>
        </Card>
      </div>

      {modalOpen && stages.length > 0 && (
        <DealFormModal
          pipelineId={detalle.pipeline_id}
          stages={stages}
          deal={dealForModal}
          onClose={() => {
            setModalOpen(false);
            // El modal usa useUpdateDeal (solo invalida board) → refresca el detalle.
            void qc.invalidateQueries({ queryKey: ['crm', 'deal', dealId] });
          }}
        />
      )}
    </div>
  );
}

export default DealDetallePage;
