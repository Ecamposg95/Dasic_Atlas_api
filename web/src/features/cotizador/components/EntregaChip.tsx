import { Clock } from 'lucide-react';

type Props = {
  min: number | null;
  max: number | null;
  unidad: 'dias' | 'semanas' | null;
};

export function EntregaChip({ min, max, unidad }: Props) {
  const completo = min != null && max != null && unidad != null;
  if (!completo) {
    return (
      <span className="text-[10px] bg-surface-2 text-muted-foreground border border-dashed border-border-strong px-1.5 py-0.5 rounded flex items-center gap-1">
        <Clock className="h-2.5 w-2.5" /> + Entrega
      </span>
    );
  }
  const lbl = min === max ? `${min}` : `${min}–${max}`;
  const u = unidad === 'dias' ? 'd' : 'sem';
  return (
    <span className="text-[10px] bg-accent-glow/10 text-accent-glow px-1.5 py-0.5 rounded flex items-center gap-1">
      <Clock className="h-2.5 w-2.5" /> {lbl} {u}
    </span>
  );
}
