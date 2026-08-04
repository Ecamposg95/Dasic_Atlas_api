import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useCardex } from '../hooks/useProductos';
import type { Producto } from '../types';

type BadgeVariant = 'emerald' | 'rose' | 'amber' | 'cyan' | 'slate';

const TIPO_VARIANT: Record<string, BadgeVariant> = {
  ENTRADA: 'emerald',
  SALIDA: 'rose',
  AJUSTE: 'amber',
  RESERVA: 'cyan',
  LIBERACION: 'slate',
};

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return Number(n).toLocaleString('es-MX');
}

export function KardexModal({ producto, onClose }: { producto: Producto; onClose: () => void }) {
  const { data, isLoading } = useCardex(producto.id);

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold">Kardex — {producto.nombre}</h2>
            {producto.sku && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{producto.sku}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground ml-4">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Métricas históricas */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 border-b border-border text-xs shrink-0">
            <div>
              <div className="text-muted-foreground uppercase font-bold text-[10px]">Stock actual</div>
              <div className="text-lg font-bold">{fmt(data.inventario.stock_actual)}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase font-bold text-[10px]">Total movs.</div>
              <div className="text-lg font-bold">{data.historico.total_movimientos}</div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase font-bold text-[10px]">Primer mov.</div>
              <div className="font-medium">
                {data.historico.primer_movimiento ? data.historico.primer_movimiento.slice(0, 10) : '—'}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground uppercase font-bold text-[10px]">Último mov.</div>
              <div className="font-medium">
                {data.historico.ultimo_movimiento ? data.historico.ultimo_movimiento.slice(0, 10) : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Tabla de movimientos */}
        <div className="overflow-y-auto overflow-x-auto flex-1">
          {isLoading && (
            <p className="text-sm text-muted-foreground p-5">Cargando movimientos…</p>
          )}
          {!isLoading && data && data.movimientos.length === 0 && (
            <p className="text-sm text-muted-foreground p-5">Sin movimientos registrados para este producto.</p>
          )}
          {!isLoading && data && data.movimientos.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-muted-foreground uppercase">
                <tr>
                  <th className="p-3 text-left">Fecha</th>
                  <th className="p-3 text-center">Tipo</th>
                  <th className="p-3 text-right">Cantidad</th>
                  <th className="p-3 text-right">Stock result.</th>
                  <th className="p-3 text-left">Referencia</th>
                  <th className="p-3 text-left">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {data.movimientos.map((m) => {
                  // Los enums de stock se serializan en minúsculas desde el backend.
                  const tipo = (m.tipo || '').toUpperCase();
                  const esEgreso = tipo === 'SALIDA' || tipo === 'RESERVA';
                  return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-3 whitespace-nowrap">
                      {m.creado_en ? m.creado_en.slice(0, 16).replace('T', ' ') : '—'}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant={TIPO_VARIANT[tipo] ?? 'slate'}>{tipo}</Badge>
                    </td>
                    <td className={`p-3 text-right font-mono font-semibold ${esEgreso ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                      {esEgreso ? '−' : '+'}{fmt(Math.abs(m.cantidad))}
                    </td>
                    <td className="p-3 text-right font-mono">{fmt(m.stock_resultante)}</td>
                    <td className="p-3 text-muted-foreground">
                      {m.referencia_tipo
                        ? `${m.referencia_tipo}${m.referencia_id ? ` #${m.referencia_id}` : ''}`
                        : '—'}
                    </td>
                    <td className="p-3 max-w-[160px] truncate text-muted-foreground" title={m.motivo ?? undefined}>
                      {m.motivo ?? '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground shrink-0">
          Últimos 100 movimientos · ordenados por más reciente primero.
        </div>
      </div>
    </div>
  );
}
