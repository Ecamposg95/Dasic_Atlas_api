import { useState } from 'react';
import { confirm } from '@/lib/confirm';
import { useNavigate } from 'react-router-dom';
import { Plus, Star, Trash2, Pencil, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Contacto } from '@/features/contactos/types';
import { useContactosEmpresa, useEliminarContacto } from '@/features/contactos/hooks/useContactoMutations';
import { ContactoFormModal } from '@/features/contactos/components/ContactoFormModal';

export function ContactosTab({ clienteId }: { clienteId: number }) {
  const navigate = useNavigate();
  const { data: contactos } = useContactosEmpresa(clienteId);
  const eliminar = useEliminarContacto(clienteId);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contacto | null>(null);

  function abrirNuevo() { setEditing(null); setModalOpen(true); }
  function abrirEditar(c: Contacto) { setEditing(c); setModalOpen(true); }

  return (
    <div className="p-1 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{(contactos ?? []).length} contacto(s)</span>
        <Button size="sm" onClick={abrirNuevo}><Plus className="h-3.5 w-3.5 mr-1" /> Agregar</Button>
      </div>
      <div className="space-y-1">
        {(contactos ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm">
                {c.es_principal && <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                <span className="font-medium truncate">{c.nombre}</span>
                {c.cargo && <span className="text-xs text-muted-foreground">· {c.cargo}</span>}
              </div>
              <div className="text-xs text-muted-foreground truncate">{[c.email, c.telefono].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => navigate(`/spa/cotizador?cliente=${clienteId}&contacto=${c.id}`)}
                className="p-1 text-muted-foreground hover:text-emerald-500"
                title="Cotizar"
              >
                <FileText className="h-4 w-4" />
              </button>
              <button onClick={() => abrirEditar(c)} className="p-1 text-muted-foreground hover:text-accent-glow" title="Editar"><Pencil className="h-4 w-4" /></button>
              <button
                onClick={async () => {
                  if (await confirm({ mensaje: `¿Eliminar a ${c.nombre}?`, tono: 'danger' })) eliminar.mutate(c.id);
                }}
                className="p-1 text-muted-foreground hover:text-rose-500"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {(contactos ?? []).length === 0 && <p className="text-xs text-muted-foreground py-2">Sin contactos.</p>}
      </div>

      {modalOpen && (
        <ContactoFormModal
          key={editing?.id ?? 'new'}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          editing={editing}
          clienteIdFijo={clienteId}
        />
      )}
    </div>
  );
}
