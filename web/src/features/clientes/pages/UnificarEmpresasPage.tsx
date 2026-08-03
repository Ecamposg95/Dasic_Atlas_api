import { useState } from 'react';
import { confirm } from '@/lib/confirm';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GitMerge, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { useIsAdmin } from '@/lib/permissions';
import { useDuplicados, useMergeEmpresas } from '../hooks/useDuplicados';
import type { GrupoDuplicado } from '../types';

function fmt(n: number) {
  return `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function GrupoCard({ grupo, preselectedIds }: { grupo: GrupoDuplicado; preselectedIds: number[] }) {
  // If any preselected id is in this group, start with the first match as survivor
  const preselectedMatch = grupo.miembros.find((m) => preselectedIds.includes(m.id));
  const [survivor, setSurvivor] = useState<number>(preselectedMatch?.id ?? grupo.miembros[0]?.id ?? 0);
  const merge = useMergeEmpresas();
  const losers = grupo.miembros.filter((m) => m.id !== survivor);

  async function onConfirm() {
    const surv = grupo.miembros.find((m) => m.id === survivor);
    const resumen =
      `Se moverán al sobreviviente «${surv?.nombre_empresa}»:\n` +
      losers.reduce((a, l) => a + l.n_ordenes, 0) + ' órdenes, ' +
      losers.reduce((a, l) => a + l.n_transacciones, 0) + ' transacciones, ' +
      losers.reduce((a, l) => a + l.n_remisiones, 0) + ' remisiones, ' +
      losers.reduce((a, l) => a + l.n_contactos, 0) + ' contactos.\n' +
      `Se BORRARÁN ${losers.length} empresa(s). Esta acción no se puede deshacer.\n¿Continuar?`;
    if (!(await confirm({ mensaje: resumen, tono: 'danger' }))) return;
    merge.mutate(
      { survivor_id: survivor, loser_ids: losers.map((l) => l.id) },
      {
        onSuccess: (r) => toast({ kind: 'success', title: `Fusionadas ${r.merged} empresa(s)` }),
        onError: (e) => {
          if (e.status === 401) { window.location.href = '/spa/login'; return; }
          toast({ kind: 'error', title: 'No se pudo fusionar', description: e.detail });
        },
      },
    );
  }

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">RFC <span className="font-mono">{grupo.rfc}</span> · {grupo.miembros.length} registros</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="p-2 text-center">Sobrevive</th>
              <th className="p-2 text-left">Empresa</th>
              <th className="p-2 text-left">Contacto</th>
              <th className="p-2 text-right">Saldo</th>
              <th className="p-2 text-right">Crédito</th>
              <th className="p-2 text-center">Órd</th>
              <th className="p-2 text-center">Trans</th>
              <th className="p-2 text-center">Remis</th>
              <th className="p-2 text-center">Cont</th>
            </tr>
          </thead>
          <tbody>
            {grupo.miembros.map((m) => (
              <tr key={m.id} className={`border-t border-border ${m.id === survivor ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''}`}>
                <td className="p-2 text-center">
                  <input type="radio" name={`surv-${grupo.rfc}`} checked={m.id === survivor} onChange={() => setSurvivor(m.id)} />
                </td>
                <td className="p-2">{m.nombre_empresa}</td>
                <td className="p-2 text-muted-foreground">{m.contacto_nombre || '—'}</td>
                <td className="p-2 text-right font-mono">{fmt(m.saldo_actual)}</td>
                <td className="p-2 text-right font-mono">{fmt(m.limite_credito)}</td>
                <td className="p-2 text-center">{m.n_ordenes}</td>
                <td className="p-2 text-center">{m.n_transacciones}</td>
                <td className="p-2 text-center">{m.n_remisiones}</td>
                <td className="p-2 text-center">{m.n_contactos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">El saldo del sobreviviente se recalcula desde sus transacciones.</p>
        <Button size="sm" onClick={onConfirm} disabled={merge.isPending || losers.length === 0}>
          {merge.isPending ? 'Fusionando…' : `Fusionar ${losers.length} → sobreviviente`}
        </Button>
      </div>
    </div>
  );
}

export function UnificarEmpresasPage() {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { data, isLoading } = useDuplicados();
  const [searchParams] = useSearchParams();

  // ?ids=1,2,3 from BulkActionBar preselects those empresa IDs as survivor candidates
  const preselectedIds: number[] = searchParams.get('ids')
    ? searchParams.get('ids')!.split(',').map(Number).filter(Boolean)
    : [];

  // If preselectedIds are provided, filter groups to only show those containing those ids (if any match),
  // otherwise show all groups.
  const grupos = data ?? [];
  const filteredGrupos = preselectedIds.length > 0
    ? grupos.filter((g) => g.miembros.some((m) => preselectedIds.includes(m.id)))
    : grupos;
  const showingFiltered = preselectedIds.length > 0 && filteredGrupos.length > 0;

  if (!isAdmin) {
    return <div className="p-6 text-sm text-muted-foreground">Solo administradores pueden unificar empresas.</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-accent-glow" /> Unificar empresas duplicadas
        </h1>
        <Button variant="ghost" size="sm" onClick={() => navigate('/spa/clientes')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">
        Empresas con el mismo RFC. Elige el sobreviviente por grupo; las demás se fusionan en él
        (órdenes, transacciones, remisiones y contactos se mueven; el saldo se recalcula) y se borran.
        Acción irreversible — toma un respaldo antes.
      </p>
      {showingFiltered && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="cyan">Mostrando {filteredGrupos.length} grupo(s) con las empresas seleccionadas</Badge>
          <button onClick={() => navigate('/spa/empresas-unificar')} className="text-xs hover:underline text-muted-foreground">
            Ver todos
          </button>
        </div>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground/70">Cargando…</p>
      ) : !(showingFiltered ? filteredGrupos : grupos).length ? (
        <div className="text-center py-12">
          <Badge variant="emerald">Sin duplicados por RFC 🎉</Badge>
        </div>
      ) : (
        <div className="space-y-4">
          {(showingFiltered ? filteredGrupos : grupos).map((g) => (
            <GrupoCard key={g.rfc} grupo={g} preselectedIds={preselectedIds} />
          ))}
        </div>
      )}
    </div>
  );
}
