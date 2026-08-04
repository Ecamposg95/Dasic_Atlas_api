import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/stores/theme';

const LABELS: Record<ThemeMode, string> = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
  auto: 'Tema automático (sistema)',
};

export function ThemeToggle() {
  const mode = useTheme((s) => s.mode);
  const cycle = useTheme((s) => s.cycle);

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${LABELS[mode]} · click para cambiar`}
      aria-label={LABELS[mode]}
      className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition"
    >
      {mode === 'light' && <Sun className="h-4 w-4 text-amber-500" />}
      {mode === 'dark' && <Moon className="h-4 w-4 text-accent-glow" />}
      {mode === 'auto' && <Monitor className="h-4 w-4" />}
    </button>
  );
}
