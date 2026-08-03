import { useEmpresaActividad } from '../../hooks/useEmpresa360';

const dot: Record<string, string> = {
  venta: 'bg-emerald-500', cotizacion: 'bg-sky-500', remision: 'bg-violet-500',
  pago: 'bg-emerald-500', cargo: 'bg-amber-500',
};

export function ActividadTab({ clienteId }: { clienteId: number }) {
  const { data, isLoading } = useEmpresaActividad(clienteId);
  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Cargando actividad…</div>;
  if (!data?.length) return <div className="text-sm text-muted-foreground p-4">Sin actividad.</div>;
  return (
    <ul className="space-y-2 p-1">
      {data.map((e, i) => (
        <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <span className={`mt-1.5 h-2 w-2 rounded-full ${dot[e.tipo] ?? 'bg-muted-foreground'}`} />
          <div className="flex-1">
            <div className="text-sm text-foreground">{e.descripcion}</div>
            <div className="text-xs text-muted-foreground">
              {e.fecha ? new Date(e.fecha).toLocaleDateString('es-MX') : '—'}
              {e.monto != null && ` · $${e.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
