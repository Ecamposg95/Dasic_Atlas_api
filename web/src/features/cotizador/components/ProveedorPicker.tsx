import { useCallback, useRef, useState } from 'react';
import { Building2, ChevronDown, X } from 'lucide-react';
import { useDismiss } from '@/lib/useDismiss';
import { useProveedores } from '../hooks/useProveedores';

type Props = {
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Dropdown con búsqueda para elegir proveedor. Reusa `useProveedores`
 * (queryKey `['proveedores']`, 5 min stale).
 *
 * Patrón visual alineado a `ClientPicker.tsx`: input que abre overlay con
 * lista filtrada, click selecciona y cierra, botón X limpia selección.
 */
export function ProveedorPicker({ value, onChange, placeholder = 'Sin asignar — busca proveedor…', className = '' }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: proveedores } = useProveedores();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, close, open);

  const seleccionado = (proveedores ?? []).find((p) => p.id === value) ?? null;
  const needle = q.trim().toLowerCase();
  const filtrados = (proveedores ?? []).filter((p) =>
    !needle || p.nombre_empresa.toLowerCase().includes(needle),
  );

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={open ? q : seleccionado ? seleccionado.nombre_empresa : ''}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQ(''); }}
          placeholder={placeholder}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="w-full h-8 pl-8 pr-12 rounded border border-border-strong bg-card text-xs focus:border-accent-glow focus:ring-2 focus:ring-accent-glow/40 outline-none"
        />
        {seleccionado && !open && (
          <button
            type="button"
            onClick={() => { onChange(null); setQ(''); }}
            title="Limpiar proveedor"
            className="absolute right-7 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-rose-400"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <ChevronDown
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground transition-transform pointer-events-none ${open ? 'rotate-180' : ''}`}
        />
      </div>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-card border border-border-strong rounded shadow-xl z-30">
          {filtrados.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground text-center">Sin coincidencias</div>
          ) : (
            filtrados.map((p) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={p.id === value}
                onClick={() => { onChange(p.id); setOpen(false); setQ(''); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition border-b border-border last:border-b-0 ${
                  p.id === value ? 'bg-accent-glow/10 text-accent-glow' : 'text-foreground hover:bg-surface-2/60'
                }`}
              >
                {p.nombre_empresa}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
