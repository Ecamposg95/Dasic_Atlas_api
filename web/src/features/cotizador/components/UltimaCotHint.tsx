import { Clock4 } from 'lucide-react';
import { useUltimaCot } from '../hooks/useUltimaCot';

// Phase 5 (Task 5.3): hint inline bajo el ClientPicker que muestra la última
// cotización del cliente seleccionado. No renderiza nada si:
//  - no hay cliente
//  - la query aún no resolvió
//  - el backend devolvió `null` (cliente sin historial)

function fmtMoney(n: number | null | undefined, m: string | null | undefined) {
  if (n == null) return '—';
  return `${m ?? 'MXN'} $${Number(n).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
  })}`;
}

export function UltimaCotHint({ clienteId }: { clienteId: number | null }) {
  const { data } = useUltimaCot(clienteId);
  if (clienteId == null || !data || !data.folio) return null;
  return (
    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
      <Clock4 className="h-3 w-3 shrink-0" />
      <span>Última cot:</span>
      <a
        href={`/seguimiento?folio=${encodeURIComponent(data.folio)}`}
        className="font-mono text-accent-glow hover:underline"
      >
        {data.folio}
      </a>
      <span>· {fmtMoney(data.total, data.moneda)}</span>
      {data.dias_atras != null && (
        <span>
          · hace {data.dias_atras} día{data.dias_atras === 1 ? '' : 's'}
        </span>
      )}
      {data.estatus && (
        <span className="text-[10px] bg-surface-2 text-muted-foreground px-1 rounded">
          {data.estatus}
        </span>
      )}
    </div>
  );
}
