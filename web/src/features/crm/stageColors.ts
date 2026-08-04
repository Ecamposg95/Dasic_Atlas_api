import type { CSSProperties } from 'react';
import type { Stage } from './types';

// Paleta fija de colores para etapas (se persiste el hex en `stages.color`).
export const STAGE_PALETTE: Array<{ nombre: string; hex: string }> = [
  { nombre: 'Esmeralda', hex: '#10b981' },
  { nombre: 'Cielo', hex: '#0ea5e9' },
  { nombre: 'Violeta', hex: '#8b5cf6' },
  { nombre: 'Ámbar', hex: '#f59e0b' },
  { nombre: 'Rosa', hex: '#f43f5e' },
  { nombre: 'Azul', hex: '#3b82f6' },
  { nombre: 'Teal', hex: '#14b8a6' },
  { nombre: 'Gris', hex: '#6b7280' },
];

// Badge con el acento esmeralda del sistema (reemplaza el viejo cyan).
export const ACCENT_BADGE_CLASS =
  'border-accent-glow/40 bg-accent-glow/10 text-accent-deep dark:text-accent-glow';

export type StageBadgeProps = {
  variant?: 'default' | 'amber' | 'emerald' | 'rose' | 'violet' | 'slate';
  className?: string;
  style?: CSSProperties;
};

// Resuelve cómo pintar el badge de una etapa:
// - Etapas de cierre → semántico (emerald ganado / rose perdido).
// - Color hex (paleta nueva) → estilo inline derivado del hex.
// - Nombres legacy ("amber", "violet", …) → variant del Badge; cyan/blue/lead
//   y desconocidos caen al acento esmeralda del sistema (antes cyan).
export function stageBadgeProps(
  stage: Pick<Stage, 'color' | 'es_ganado' | 'es_perdido'>,
): StageBadgeProps {
  if (stage.es_ganado) return { variant: 'emerald' };
  if (stage.es_perdido) return { variant: 'rose' };

  const c = (stage.color ?? '').toLowerCase().trim();
  if (!c) return { variant: 'default' };

  if (c.startsWith('#')) {
    // Sufijos hex-alpha: ~35% borde, ~12% fondo.
    return {
      style: { borderColor: `${c}59`, backgroundColor: `${c}1f`, color: c },
    };
  }

  if (c.includes('amber') || c.includes('yellow') || c.includes('orange')) return { variant: 'amber' };
  if (c.includes('green') || c.includes('emerald') || c.includes('teal') || c.includes('won') || c.includes('ganado')) return { variant: 'emerald' };
  if (c.includes('red') || c.includes('rose') || c.includes('lost') || c.includes('perdido')) return { variant: 'rose' };
  if (c.includes('violet') || c.includes('purple')) return { variant: 'violet' };
  if (c.includes('slate') || c.includes('gray') || c.includes('grey')) return { variant: 'slate' };

  return { className: ACCENT_BADGE_CLASS };
}
