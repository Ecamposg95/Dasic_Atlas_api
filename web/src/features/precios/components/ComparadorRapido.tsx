import { useState } from 'react';
import { Trophy, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCompararPorTexto } from '../hooks/usePrecios';
import type { Moneda } from '../types';

function fmtPrecio(precio: number, _moneda: Moneda): string {
  return `$${precio.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Comparador rápido: input de búsqueda libre por SKU o descripción.
 * Devuelve el mismo shape que ComparativaResponse, ordenado por precio asc.
 * El primer resultado (más barato) se resalta con icono Trophy.
 */
export function ComparadorRapido() {
  const [input, setInput] = useState('');
  // queryText es el último valor confirmado con Enter/botón. Mientras es '' el hook está disabled.
  const [queryText, setQueryText] = useState('');

  const { data, isFetching, error } = useCompararPorTexto(queryText);
  const items = data?.items ?? [];

  function submit() {
    const v = input.trim();
    if (!v) return;
    setQueryText(v);
  }

  // Sin Card propio: PreciosPage lo envuelve en <CollapsibleCard title="Comparador rápido">.
  return (
    <div>
        <div className="flex flex-wrap gap-2 items-stretch">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="Buscar SKU o descripción…"
              className="pl-9"
            />
          </div>
          <Button size="sm" onClick={submit} disabled={!input.trim() || isFetching}>
            {isFetching ? 'Buscando…' : 'Comparar'}
          </Button>
        </div>

        {queryText && (
          <div className="mt-4">
            {error ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                No se pudo comparar. Intenta de nuevo.
              </p>
            ) : items.length === 0 && !isFetching ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sin coincidencias para «{queryText}».
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-[10px] text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="text-left p-2 w-10">#</th>
                      <th className="text-left p-2">Proveedor</th>
                      <th className="text-right p-2">Precio</th>
                      <th className="text-center p-2">Moneda</th>
                      <th className="text-left p-2">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const isWinner = idx === 0;
                      return (
                        <tr
                          key={`${it.proveedor_id}-${it.precio_id}`}
                          className={
                            isWinner
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-b border-border'
                              : 'border-b border-border'
                          }
                        >
                          <td className="p-2 text-xs text-foreground">
                            <span className="inline-flex items-center gap-1">
                              {idx + 1}
                              {isWinner && (
                                <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              )}
                            </span>
                          </td>
                          <td className="p-2 text-foreground">
                            {it.proveedor_nombre ?? `Prov. ${it.proveedor_id}`}
                          </td>
                          <td
                            className={`p-2 text-right font-mono tabular-nums ${
                              isWinner
                                ? 'text-emerald-700 dark:text-emerald-300 font-semibold'
                                : 'text-foreground'
                            }`}
                          >
                            {fmtPrecio(it.precio, it.moneda)}
                          </td>
                          <td className="p-2 text-center text-xs font-mono text-muted-foreground">
                            {it.moneda}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {it.fecha_vigencia_desde ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
