import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { PlatformShell } from '../components/PlatformShell';
import { useConfigPlataforma, useSetConfigPlataforma, type ConfigItem } from '../hooks/useConfigPlataforma';

const LABELS: Record<string, string> = {
  iva_rate: 'IVA (proporción, ej. 0.16 = 16%)',
  quote_validity_days: 'Vigencia de cotización (días)',
};

function Row({ item }: { item: ConfigItem }) {
  const [val, setVal] = useState(String(item.valor_efectivo));
  const set = useSetConfigPlataforma();
  return (
    <div className="flex items-end gap-3 flex-wrap border-b border-emerald-500/10 py-3 last:border-0">
      <div className="flex-1 min-w-[200px]">
        <label className="block font-mono text-[11px] text-muted-foreground mb-1">
          {LABELS[item.clave] ?? item.clave}
        </label>
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="max-w-[200px] font-mono text-sm border-emerald-500/20 focus-visible:ring-emerald-500"
        />
        <div className="font-mono text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
          Default: {item.default}{' '}
          {item.overrideado ? (
            <Badge variant="emerald">override activo</Badge>
          ) : (
            <Badge variant="slate">usando default</Badge>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={set.isPending}
          onClick={() =>
            set.mutate(
              { clave: item.clave, valor: val.trim() },
              {
                onSuccess: () => toast({ kind: 'success', title: 'Configuración guardada' }),
                onError: (e) => {
                  if (e.status === 401) {
                    window.location.href = '/spa/login';
                    return;
                  }
                  toast({ kind: 'error', title: 'No se pudo guardar', description: e.detail });
                },
              },
            )
          }
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          Guardar
        </Button>
        {item.overrideado && (
          <Button
            size="sm"
            variant="ghost"
            disabled={set.isPending}
            onClick={() =>
              set.mutate(
                { clave: item.clave, valor: null },
                {
                  onSuccess: () => {
                    toast({ kind: 'success', title: 'Restaurado al default' });
                    setVal(String(item.default));
                  },
                },
              )
            }
            className="text-muted-foreground hover:text-foreground"
          >
            Restaurar default
          </Button>
        )}
      </div>
    </div>
  );
}

export function ConfigPlataformaPage() {
  const { data, isLoading } = useConfigPlataforma();

  return (
    <PlatformShell title="Configuración de plataforma">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] text-muted-foreground mb-6">
          Cambios aplican sin redeploy. Afectan cotizaciones nuevas y comportamiento global del sistema.
        </p>
        <div className="rounded-xl border border-emerald-500/20 bg-card divide-y divide-emerald-500/10 overflow-hidden">
          {isLoading ? (
            <p className="font-mono text-sm text-muted-foreground px-4 py-6">Cargando configuración…</p>
          ) : (
            <div className="px-4 py-2">
              {(data?.items ?? []).map((it) => <Row key={it.clave} item={it} />)}
            </div>
          )}
        </div>
      </div>
    </PlatformShell>
  );
}
