import { useCallback, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDismiss } from '@/lib/useDismiss';
import { useOrdenesRemisionables } from '../hooks/useRemisiones';
import type { OrdenHistorialItem } from '../types';

// Orden seleccionada mostrada como chip (folio + cliente). Es un shape propio
// (no OrdenHistorialItem) para que el consumidor pueda reconstruirla desde un
// borrador reabierto (donde solo hay orden_venta_id/orden_folio/cliente).
export type OrdenPickerValue = {
  id: number;
  folio: string;
  cliente_nombre: string | null;
};

// Selector de orden de venta remisionable — mismo look & feel que el
// ClientPicker del cotizador: input con búsqueda → dropdown de resultados;
// seleccionado → chip con folio+cliente y botón × para limpiar.
// `useOrdenesRemisionables` no acepta búsqueda (trae hasta 200 del
// historial), así que el filtro folio/cliente es client-side.
export function OrdenPicker({
  value,
  onSelect,
  onClear,
  disabled = false,
}: {
  value: OrdenPickerValue | null;
  onSelect: (orden: OrdenHistorialItem) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const { data: ordenes, isLoading, error } = useOrdenesRemisionables();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, close, open);

  const matches = useMemo(() => {
    const lista = ordenes ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return lista.slice(0, 50);
    return lista
      .filter(
        (o) =>
          o.folio.toLowerCase().includes(needle) ||
          (o.cliente ?? '').toLowerCase().includes(needle),
      )
      .slice(0, 50);
  }, [ordenes, q]);

  if (value) {
    return (
      <div className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-border-strong rounded-md bg-card">
        <div className="min-w-0">
          <div className="text-sm font-medium font-mono text-accent-glow truncate">
            {value.folio}
          </div>
          {value.cliente_nombre && (
            <div className="text-xs text-muted-foreground truncate">{value.cliente_nombre}</div>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Quitar orden"
            className="shrink-0 text-muted-foreground hover:text-rose-400 transition"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground px-3 py-2 border border-border-strong rounded-md bg-card">
        Cargando órdenes…
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-xs text-rose-400 px-3 py-2 border border-rose-800 rounded-md bg-card">
        Error al cargar órdenes
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Buscar orden por folio o cliente…"
          className="pl-8"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
        />
      </div>
      {open && !disabled && (
        <div
          role="listbox"
          className="absolute left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-card border border-border-strong rounded-md shadow-xl z-20"
        >
          {matches.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {q.trim() ? 'Sin coincidencias' : 'No hay órdenes remisionables'}
            </div>
          ) : (
            matches.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onSelect(o);
                  setQ('');
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-surface-2/60 transition border-b border-border last:border-b-0"
              >
                <div className="text-sm font-mono text-accent-glow">{o.folio}</div>
                <div className="text-[11px] text-muted-foreground truncate">{o.cliente ?? ''}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
