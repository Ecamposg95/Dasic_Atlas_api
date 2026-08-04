import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { DealCard } from './DealCard';
import { stageBadgeProps } from '../stageColors';
import type { Stage, Deal } from '../types';
import type { Cliente } from '@/features/clientes/types';
import type { Usuario } from '@/features/usuarios/types';

function sumMontos(deals: Deal[]): number {
  return deals.reduce((acc, d) => acc + (d.monto ?? 0), 0);
}

function formatSum(n: number): string {
  if (n === 0) return '';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  stage: Stage;
  deals: Deal[];
  clientesMap: Map<number, Cliente>;
  usuariosMap: Map<number, Usuario>;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onDrop: (dealId: number, stageId: number) => void;
};

export function KanbanColumn({ stage, deals, clientesMap, usuariosMap, onEdit, onDelete, onDrop }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Only clear if leaving the column entirely (not entering a child).
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const raw = e.dataTransfer.getData('text/plain');
    const dealId = parseInt(raw, 10);
    if (!isNaN(dealId)) {
      onDrop(dealId, stage.id);
    }
  }

  const badge = stageBadgeProps(stage);
  const total = sumMontos(deals);

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge variant={badge.variant} className={badge.className} style={badge.style}>
            {stage.nombre}
          </Badge>
          <span className="text-[11px] text-muted-foreground font-medium shrink-0">
            {deals.length}
          </span>
        </div>
        {total > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {formatSum(total)}
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex-1 min-h-[120px] rounded-xl p-2 space-y-2 transition-all duration-150 ${
          isDragOver
            ? 'ring-2 ring-accent-glow bg-accent-glow/5'
            : 'bg-surface-2/50'
        }`}
      >
        {deals.length === 0 && (
          <div className="flex items-center justify-center h-20 text-[11px] text-muted-foreground opacity-50 border-2 border-dashed border-border rounded-lg">
            Sin deals
          </div>
        )}
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            clientesMap={clientesMap}
            usuariosMap={usuariosMap}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
