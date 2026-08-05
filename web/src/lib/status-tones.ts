export type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

// Cada tono declara su pareja clara y su variante `dark:`.
//
// Antes solo tenía los tonos de la rampa OSCURA y ningún prefijo `dark:`, así
// que en tema claro pintaba texto `emerald-400` sobre un lavado casi blanco:
// **1.66:1 de contraste**, contra el mínimo de 4.5:1 que exige WCAG AA. Era
// ilegible en las 11 pantallas que usan `StatusBadge`. `badge.tsx` ya lo hacía
// bien desde siempre — esto es espejo de aquello, no un criterio nuevo.
//
// El par claro da 4.84:1 y el oscuro 9.39:1. `status-tones.test.ts` lo verifica
// calculando el contraste, para que nadie los vuelva a tocar a ojo.
const TONE_CLASSES: Record<StatusTone, string> = {
  success:
    'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30',
  warning:
    'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30',
  info:
    'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30',
  danger:
    'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30',
  // Neutral ya usaba tokens semánticos: se adapta al tema por sí solo.
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
