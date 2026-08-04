// Tono/label de estado — compartido entre la lista de remisiones, su
// detalle y la tarjeta de "Avance de entrega" en la venta (Task 11).
//
// Deliberadamente NO usa el mapeo global de `@/lib/status-tones`
// (`statusTone('borrador')` ahí cae en 'info', compartido con el estatus
// 'cotizacion' del cotizador — dominio distinto). Igual que
// `SeguimientoPage` con su propio `estatusBadge`, cada feature con
// semántica de color propia resuelve su tono localmente en vez de mutar el
// mapa compartido.
import type { StatusTone } from '@/lib/status-tones';
import type { AvancePartidaEstado, RemisionEstado } from '../types';

export function remisionEstadoTone(estado: RemisionEstado): StatusTone {
  switch (estado) {
    case 'borrador':
      return 'neutral';
    case 'emitida':
      return 'info';
    case 'recibida':
      return 'success';
    case 'cancelada':
      return 'danger';
  }
}

export function remisionEstadoLabel(estado: RemisionEstado): string {
  switch (estado) {
    case 'borrador':
      return 'BORRADOR';
    case 'emitida':
      return 'EMITIDA';
    case 'recibida':
      return 'RECIBIDA';
    case 'cancelada':
      return 'CANCELADA';
  }
}

export function avancePartidaTone(estado: AvancePartidaEstado): StatusTone {
  switch (estado) {
    case 'ENTREGADA':
      return 'success';
    case 'PARCIAL':
      return 'warning';
    case 'NO_ENTREGADA':
      return 'neutral';
  }
}

export function avancePartidaLabel(estado: AvancePartidaEstado): string {
  switch (estado) {
    case 'ENTREGADA':
      return 'Entregada';
    case 'PARCIAL':
      return 'Parcial';
    case 'NO_ENTREGADA':
      return 'No entregada';
  }
}
