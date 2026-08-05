import { describe, expect, it } from 'vitest';
import { statusTone, toneClasses, type StatusTone } from './status-tones';

/**
 * Contraste de los tonos de estado, calculado — no revisado a ojo.
 *
 * `status-tones.ts` no tenía ni un prefijo `dark:` y usaba los tonos de la
 * rampa oscura, así que en tema claro pintaba `emerald-400` sobre un lavado
 * casi blanco: 1.66:1, contra el mínimo de 4.5:1 de WCAG AA. Afectaba a las 11
 * pantallas que usan `StatusBadge`, y no se detecta leyendo el código: hay que
 * hacer la cuenta.
 */

// Valores de la paleta de Tailwind usados por el mapa de tonos.
const PALETA: Record<string, string> = {
  'emerald-100': '#d1fae5', 'emerald-700': '#047857',
  'emerald-400': '#34d399', 'emerald-500': '#10b981',
  'amber-100': '#fef3c7', 'amber-700': '#b45309',
  'amber-400': '#fbbf24', 'amber-500': '#f59e0b',
  'sky-100': '#e0f2fe', 'sky-700': '#0369a1',
  'sky-400': '#38bdf8', 'sky-500': '#0ea5e9',
  'rose-100': '#ffe4e6', 'rose-700': '#be123c',
  'rose-400': '#fb7185', 'rose-500': '#f43f5e',
};

/** Fondo de card en tema oscuro (token `--card` de index.css). */
const CARD_OSCURO = '#0f1720';

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Mezcla `fg` con opacidad `alpha` sobre `bg` (las clases `/15` de Tailwind). */
function mezclar(fg: string, alpha: number, bg: string): string {
  let out = '#';
  for (const i of [1, 3, 5]) {
    const c = Math.round(
      parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha),
    );
    out += c.toString(16).padStart(2, '0');
  }
  return out;
}

const MINIMO_AA = 4.5;
const TONOS_CON_COLOR: Array<{ tono: StatusTone; base: string }> = [
  { tono: 'success', base: 'emerald' },
  { tono: 'warning', base: 'amber' },
  { tono: 'info', base: 'sky' },
  { tono: 'danger', base: 'rose' },
];

describe('contraste de los tonos de estado', () => {
  it.each(TONOS_CON_COLOR)('$tono cumple AA en tema claro', ({ base }) => {
    // Texto -700 sobre fondo -100, que es lo que declara el mapa.
    const r = contraste(PALETA[`${base}-700`], PALETA[`${base}-100`]);
    expect(r).toBeGreaterThanOrEqual(MINIMO_AA);
  });

  it.each(TONOS_CON_COLOR)('$tono cumple AA en tema oscuro', ({ base }) => {
    // Texto -400 sobre el fondo de card mezclado con -500 al 15%.
    const fondo = mezclar(PALETA[`${base}-500`], 0.15, CARD_OSCURO);
    const r = contraste(PALETA[`${base}-400`], fondo);
    expect(r).toBeGreaterThanOrEqual(MINIMO_AA);
  });

  it('el par de la rampa oscura sobre fondo claro NO cumple — es el bug que se corrigió', () => {
    // Documenta por qué existe este archivo: la combinación anterior daba 1.66.
    const fondoClaro = mezclar(PALETA['emerald-500'], 0.15, '#ffffff');
    expect(contraste(PALETA['emerald-400'], fondoClaro)).toBeLessThan(MINIMO_AA);
  });
});

describe('toneClasses declara ambos temas', () => {
  it.each(TONOS_CON_COLOR)('$tono trae variante dark:', ({ tono }) => {
    const clases = toneClasses(tono);
    // Sin `dark:` el tono solo sirve para un tema, que es como empezó el bug.
    expect(clases).toMatch(/dark:/);
    expect(clases).toMatch(/dark:text-/);
    expect(clases).toMatch(/dark:bg-/);
  });

  it('neutral usa tokens semánticos y por eso no necesita dark:', () => {
    const clases = toneClasses('neutral');
    expect(clases).toContain('text-muted-foreground');
    expect(clases).not.toMatch(/dark:/);
  });
});

describe('statusTone', () => {
  it('mapea estatus conocidos', () => {
    expect(statusTone('pagada')).toBe('success');
    expect(statusTone('cancelada')).toBe('danger');
    expect(statusTone('pendiente')).toBe('warning');
  });

  it('es insensible a mayúsculas', () => {
    expect(statusTone('PAGADA')).toBe('success');
  });

  it('cae a neutral con lo desconocido, null o vacío', () => {
    expect(statusTone('lo_que_sea')).toBe('neutral');
    expect(statusTone(null)).toBe('neutral');
    expect(statusTone('')).toBe('neutral');
  });
});
