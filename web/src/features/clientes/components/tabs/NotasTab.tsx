import { useState } from 'react';
import { useNotasEmpresa, useCrearNota, useBorrarNota } from '../../hooks/useEmpresa360';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';

export function NotasTab({ clienteId }: { clienteId: number }) {
  const { data, isLoading } = useNotasEmpresa(clienteId);
  const crear = useCrearNota(clienteId);
  const borrar = useBorrarNota(clienteId);
  const [texto, setTexto] = useState('');

  const submit = () => {
    if (!texto.trim()) return;
    crear.mutate(texto.trim(), {
      onSuccess: () => { setTexto(''); toast({ kind: 'success', title: 'Nota agregada' }); },
      onError: () => toast({ kind: 'error', title: 'No se pudo agregar la nota' }),
    });
  };

  return (
    <div className="p-1 space-y-3">
      <div className="flex gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe una nota interna…"
          className="flex-1 text-sm rounded-md border border-border-strong bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-glow/40"
          rows={2}
        />
        <Button onClick={submit} disabled={crear.isPending || !texto.trim()}>Agregar</Button>
      </div>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Cargando…</div>
      ) : !data?.length ? (
        <div className="text-sm text-muted-foreground">Sin notas.</div>
      ) : (
        <ul className="space-y-2">
          {data.map((n) => (
            <li key={n.id} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="text-sm text-foreground whitespace-pre-wrap">{n.texto}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">
                  {n.autor_nombre ?? 'Alguien'} · {n.creado_en ? new Date(n.creado_en).toLocaleString('es-MX') : ''}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    // Único borrado del sistema que no preguntaba: los otros 43
                    // sitios usan `confirm()` con el tono y el nombre del registro.
                    const ok = await confirm({
                      titulo: 'Borrar nota',
                      mensaje: 'La nota se elimina para todos. Esta acción no se puede deshacer.',
                      tono: 'danger',
                      confirmLabel: 'Borrar',
                    });
                    if (ok) borrar.mutate(n.id);
                  }}
                  disabled={borrar.isPending}
                  className="text-xs text-rose-500 hover:underline disabled:opacity-50"
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
