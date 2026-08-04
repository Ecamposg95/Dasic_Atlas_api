export type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  info: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  danger: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  neutral: 'bg-surface-2 text-muted-foreground border-border',
};

export function toneClasses(tone: StatusTone): string {
  return TONE_CLASSES[tone];
}

// Estatus crudo del backend (lowercase) → tono semántico.
const STATUS_TONE: Record<string, StatusTone> = {
  cotizacion: 'info', borrador: 'info', pendiente: 'warning', pagada: 'success', cancelada: 'danger',
  pospuesto: 'warning', completado: 'success',
  activo: 'success', prospecto: 'warning', inactivo: 'danger',
  recibida: 'success', recibida_parcial: 'warning', en_oc: 'info', recibido: 'success',
  promovido: 'success', descartado: 'danger',
  vigente: 'success', vencida: 'danger', por_vencer: 'warning',
  // Estatus orden de compra
  enviada: 'warning', confirmada: 'info', pagado: 'success',
};

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return STATUS_TONE[status.toLowerCase()] ?? 'neutral';
}
