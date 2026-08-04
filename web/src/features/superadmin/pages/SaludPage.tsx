import { AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PlatformShell } from '../components/PlatformShell';
import { useHealth, formatUptime, type RuntimeConfigItem } from '../hooks/useHealth';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' });
}

// ─── Sub-panels ──────────────────────────────────────────────────────────────

function PanelHeader({ label }: { label: string }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/70 px-3 pt-3 pb-1 border-b border-emerald-500/10">
      {label}
    </div>
  );
}

function Row({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3 py-1.5 border-b border-border/60 last:border-0">
      <span className="font-mono text-[11px] text-muted-foreground shrink-0">{label}</span>
      <span className={`${mono ? 'font-mono' : ''} text-xs text-foreground text-right`}>{value}</span>
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-emerald-500/20 bg-card overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

// ─── Count labels ─────────────────────────────────────────────────────────────
const COUNT_LABELS: Record<string, string> = {
  usuarios: 'Usuarios',
  clientes: 'Clientes',
  contactos: 'Contactos',
  productos: 'Productos',
  ordenes_venta: 'Órdenes de venta',
  remisiones: 'Remisiones',
  ordenes_compra: 'Órdenes de compra',
  deals: 'Deals CRM',
  quote_events: 'Eventos de cotización',
  gastos: 'Gastos',
  productos_fantasma: 'Productos fantasma',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SaludPage() {
  const { data, isLoading, isError, refetch, isFetching } = useHealth();

  return (
    <PlatformShell title="Salud del sistema">
      <div className="max-w-5xl space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-muted-foreground">
            Actualización automática cada 30s
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 font-mono text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refrescar
          </button>
        </div>

        {isLoading && (
          <p className="font-mono text-sm text-muted-foreground">Cargando datos de salud…</p>
        )}

        {isError && (
          <div className="flex items-center gap-2 font-mono text-sm text-rose-400">
            <XCircle className="h-4 w-4" /> Error al cargar. ¿El backend está corriendo?
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ── App ──────────────────────────────────────────────────────── */}
            <Panel>
              <PanelHeader label="App" />
              <Row label="version" value={data.app.version} />
              <Row label="git_sha" value={data.app.git_sha ? data.app.git_sha.slice(0, 12) : '—'} />
              <Row label="python" value={data.app.python} />
              <Row label="env" value={data.app.env} />
              <Row label="started_at" value={fmtDate(data.app.started_at)} />
              <Row label="uptime" value={formatUptime(data.app.uptime_seconds)} />
            </Panel>

            {/* ── DB ────────────────────────────────────────────────────────── */}
            <Panel>
              <PanelHeader label="Base de datos" />
              <div className="px-3 py-2 flex items-center gap-2">
                {data.db.status === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-400" />
                )}
                <span className={`font-mono text-sm font-bold ${data.db.status === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {data.db.status.toUpperCase()}
                </span>
              </div>
              {data.db.error && (
                <div className="px-3 pb-2">
                  <pre className="font-mono text-[11px] text-rose-300 bg-rose-900/20 rounded p-2 whitespace-pre-wrap break-all">
                    {data.db.error}
                  </pre>
                </div>
              )}
            </Panel>

            {/* ── Integraciones ─────────────────────────────────────────────── */}
            <Panel>
              <PanelHeader label="Integraciones" />
              <div className="flex flex-wrap gap-2 px-3 py-3">
                {Object.entries(data.integraciones).map(([key, ok]) => (
                  <span
                    key={key}
                    className={`font-mono text-[11px] px-2.5 py-1 rounded-full border font-medium ${
                      ok
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {ok ? '✓' : '✗'} {key}
                  </span>
                ))}
              </div>
            </Panel>

            {/* ── FX ────────────────────────────────────────────────────────── */}
            <Panel>
              <PanelHeader label="Tipo de cambio (FX)" />
              {data.fx == null ? (
                <p className="font-mono text-xs text-muted-foreground px-3 py-2">Sin datos de FX.</p>
              ) : (
                <>
                  <Row label="USD/MXN" value={`$${data.fx.usd_mxn.toFixed(4)}`} />
                  <Row label="fuente" value={data.fx.fuente} />
                  <Row label="fecha" value={data.fx.fecha} />
                  <Row label="obtenido_en" value={fmtDate(data.fx.obtenido_en)} />
                  <div className="px-3 py-1.5 flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">age</span>
                    <span
                      className={`font-mono text-xs font-bold ${
                        data.fx.age_horas > 24 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {data.fx.age_horas.toFixed(1)}h
                    </span>
                    {data.fx.age_horas > 24 && (
                      <div className="flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="font-mono text-[10px]">dato viejo</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </Panel>

            {/* ── Conteos ──────────────────────────────────────────────────── */}
            <Panel className="md:col-span-2">
              <PanelHeader label="Conteos" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-0 divide-x divide-y divide-emerald-500/10">
                {Object.entries(data.counts).map(([key, val]) => (
                  <div key={key} className="px-3 py-2 flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">
                      {COUNT_LABELS[key] ?? key}
                    </span>
                    <span
                      className={`font-mono text-lg font-bold ${
                        val === -1 ? 'text-rose-400' : 'text-emerald-300'
                      }`}
                    >
                      {val === -1 ? 'error' : val.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            {/* ── Runtime config ───────────────────────────────────────────── */}
            {data.runtime_config.length > 0 && (
              <Panel className="md:col-span-2">
                <PanelHeader label="Runtime config" />
                <div className="divide-y divide-border/60">
                  {data.runtime_config.map((item: RuntimeConfigItem) => (
                    <div key={item.clave} className="flex items-center justify-between gap-4 px-3 py-2">
                      <span className="font-mono text-xs text-muted-foreground">{item.clave}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-foreground font-bold">
                          {String(item.valor_efectivo)}
                        </span>
                        <Badge variant={item.overrideado ? 'emerald' : 'slate'}>
                          {item.overrideado ? 'override' : 'default'}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          dflt: {String(item.default)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}
      </div>
    </PlatformShell>
  );
}
