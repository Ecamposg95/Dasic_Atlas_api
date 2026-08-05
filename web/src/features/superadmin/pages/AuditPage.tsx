import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QueryError } from '@/components/ui/query-error';
import { PlatformShell } from '../components/PlatformShell';
import { useUsuarios } from '@/features/usuarios/hooks/useUsuarios';
import { useAudit, type AuditFuente, type AuditFiltros } from '../hooks/useAudit';
import { useConfigPlataforma } from '../hooks/useConfigPlataforma';

const PAGE_SIZE = 50;

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

export function AuditPage() {
  const [fuente, setFuente] = useState<AuditFuente | ''>('');
  const [usuarioId, setUsuarioId] = useState<string>('');
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: usuarios } = useUsuarios();
  const { data: config } = useConfigPlataforma();
  const filtros: AuditFiltros = {
    fuente: fuente || undefined,
    usuario_id: usuarioId ? Number(usuarioId) : undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    page,
  };
  const { data, isLoading, isError, error, refetch } = useAudit(filtros);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.page_size ?? PAGE_SIZE)));

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  return (
    <PlatformShell title="Auditoría global">
      <div className="max-w-6xl space-y-4">
        <p className="font-mono text-[11px] text-muted-foreground">
          Actividad registrada en el sistema (cotizaciones y fusiones de empresas).
        </p>

        {/* Snapshot de config vigente */}
        {config?.items?.length ? (
          <div className="flex flex-wrap gap-4 font-mono text-xs border border-emerald-500/20 rounded-lg px-3 py-2 bg-emerald-500/5">
            <span className="text-emerald-500/70 font-semibold uppercase tracking-widest text-[10px]">
              Config vigente:
            </span>
            {config.items.map((c) => (
              <span key={c.clave} className="flex items-center gap-1">
                <span className="text-muted-foreground">{c.clave}:</span>
                <span className="font-medium text-foreground">{String(c.valor_efectivo)}</span>
                <Badge variant={c.overrideado ? 'emerald' : 'slate'}>
                  {c.overrideado ? 'override' : 'default'}
                </Badge>
              </span>
            ))}
          </div>
        ) : null}

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block font-mono text-[10px] text-muted-foreground mb-1 uppercase">Fuente</label>
            <select
              value={fuente}
              onChange={(e) => resetPage(setFuente)(e.target.value as AuditFuente | '')}
              className="border border-emerald-500/20 bg-card text-foreground rounded-md px-2 py-1.5 font-mono text-xs"
            >
              <option value="">Todas</option>
              <option value="cotizacion">Cotizaciones</option>
              <option value="fusion_cliente">Fusiones</option>
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] text-muted-foreground mb-1 uppercase">Usuario</label>
            <select
              value={usuarioId}
              onChange={(e) => resetPage(setUsuarioId)(e.target.value)}
              className="border border-emerald-500/20 bg-card text-foreground rounded-md px-2 py-1.5 font-mono text-xs"
            >
              <option value="">Todos</option>
              {(usuarios ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] text-muted-foreground mb-1 uppercase">Desde</label>
            <input
              type="date"
              value={desde}
              onChange={(e) => resetPage(setDesde)(e.target.value)}
              className="border border-emerald-500/20 bg-card text-foreground rounded-md px-2 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] text-muted-foreground mb-1 uppercase">Hasta</label>
            <input
              type="date"
              value={hasta}
              onChange={(e) => resetPage(setHasta)(e.target.value)}
              className="border border-emerald-500/20 bg-card text-foreground rounded-md px-2 py-1.5 font-mono text-xs"
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="border border-emerald-500/20 rounded-xl overflow-x-auto bg-card">
          <table className="w-full text-sm">
            <thead className="bg-emerald-500/5 font-mono text-[10px] uppercase tracking-widest text-emerald-500/70">
              <tr>
                <th className="text-left font-medium px-3 py-2">Fecha</th>
                <th className="text-left font-medium px-3 py-2">Usuario</th>
                <th className="text-left font-medium px-3 py-2">Acción</th>
                <th className="text-left font-medium px-3 py-2">Entidad</th>
                <th className="text-left font-medium px-3 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
                    Cargando…
                  </td>
                </tr>
              ) : isError ? (
                <QueryError error={error} onRetry={() => void refetch()} asRow colSpan={5} />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
                    Sin actividad para estos filtros.
                  </td>
                </tr>
              ) : (
                items.map((e, i) => (
                  <tr
                    key={`${e.fuente}-${e.fecha}-${i}`}
                    className="border-t border-emerald-500/10 align-top"
                  >
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {fmtFecha(e.fecha)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {e.usuario ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge variant={e.fuente === 'fusion_cliente' ? 'slate' : 'emerald'}>
                        {e.accion}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs font-medium text-foreground">
                      {e.link ? (
                        <Link to={e.link} className="text-emerald-400 hover:underline">
                          {e.entidad}
                        </Link>
                      ) : (
                        e.entidad
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{e.detalle}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>{total} evento(s)</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="font-mono text-xs"
            >
              Anterior
            </Button>
            <span>
              Página {page} de {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="font-mono text-xs"
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </PlatformShell>
  );
}
