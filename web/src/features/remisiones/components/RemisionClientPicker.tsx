import { useState } from 'react';
import { Search, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useClientes } from '@/features/cotizador/hooks/useClientes';
import type { ClienteLite } from '../types';

// useClientes() trae toda la lista (no acepta search term).
// Filtramos client-side para evitar dependencia en el hook del cotizador.
function matchCliente(c: { nombre_empresa: string; rfc_tax_id: string | null }, q: string) {
  const lower = q.toLowerCase();
  return (
    c.nombre_empresa.toLowerCase().includes(lower) ||
    (c.rfc_tax_id ?? '').toLowerCase().includes(lower)
  );
}

export function RemisionClientPicker({ onPick }: { onPick: (c: ClienteLite) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useClientes();

  // useClientes devuelve Cliente[] (cotizador/types.ts) — shape idéntica a
  // ClienteLite (id, nombre_empresa, rfc_tax_id, email). Cast es seguro.
  const todos = (data ?? []) as ClienteLite[];
  const clientes = q.trim() ? todos.filter((c) => matchCliente(c, q)) : todos;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Buscar cliente por empresa o RFC…"
          className="pl-7 h-9 text-sm"
        />
      </div>
      {open && clientes.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-card border border-border-strong rounded-md shadow-xl z-30">
          {clientes.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // evita que onBlur cierre antes del click
              onClick={() => {
                onPick(c);
                setOpen(false);
                setQ('');
              }}
              className="w-full text-left px-3 py-2 hover:bg-surface-2/60 border-b border-border last:border-b-0 flex items-center gap-2"
            >
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-foreground truncate">
                  {c.nombre_empresa}
                </div>
                {c.rfc_tax_id && (
                  <div className="text-[11px] font-mono text-muted-foreground">{c.rfc_tax_id}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
