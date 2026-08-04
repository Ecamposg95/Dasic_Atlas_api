import { Link } from 'react-router-dom';
import { Trash2, ExternalLink } from 'lucide-react';
import type { Deal } from '../types';
import type { Cliente } from '@/features/clientes/types';
import type { Usuario } from '@/features/usuarios/types';

type Props = {
  deal: Deal;
  clientesMap: Map<number, Cliente>;
  usuariosMap: Map<number, Usuario>;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
};

function formatMonto(monto: number | null, moneda: string): string {
  if (monto == null) return '—';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda || 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monto);
}

export function DealCard({ deal, clientesMap, usuariosMap, onEdit, onDelete }: Props) {
  const cliente = deal.cliente_id != null ? clientesMap.get(deal.cliente_id) : null;
  const owner = deal.owner_user_id != null ? usuariosMap.get(deal.owner_user_id) : null;

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData('text/plain', String(deal.id));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(deal);
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => onEdit(deal)}
      className="group bg-card border border-border rounded-xl p-3 shadow-elev-1 hover:shadow-elev-2 cursor-grab active:cursor-grabbing transition-all duration-150 select-none"
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug flex-1 line-clamp-2">
          {/* Link solo en el texto del título — no interfiere con el drag del card. */}
          <Link
            to={`/spa/crm/deals/${deal.id}`}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className="hover:text-accent-glow hover:underline transition-colors"
          >
            {deal.titulo}
          </Link>
        </p>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Eliminar deal"
          className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all duration-100 mt-0.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Cliente */}
      {cliente && (
        <p className="mt-1.5 text-[11px] text-muted-foreground truncate">
          {cliente.nombre_empresa}
        </p>
      )}

      {/* Monto + owner row */}
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="text-xs font-semibold text-accent-glow tabular-nums">
          {formatMonto(deal.monto, deal.moneda)}
        </span>
        {owner && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">
            {owner.nombre}
          </span>
        )}
      </div>

      {/* Link to cotización */}
      {deal.orden_id != null && (
        <a
          href={`/spa/seguimiento?orden=${deal.orden_id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-cyan-500 hover:text-cyan-400 transition-colors"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          Ver cotización
        </a>
      )}
    </div>
  );
}
