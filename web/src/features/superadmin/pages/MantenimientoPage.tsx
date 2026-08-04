import { useState } from 'react';
import { AlertTriangle, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { confirm } from '@/lib/confirm';
import { normalizeDetail } from '@/lib/api';
import { PlatformShell } from '../components/PlatformShell';
import {
  useReseed,
  useJob,
  useSeedContext,
  useDropAllTables,
  type ReseedWhich,
  type JobWhich,
} from '../hooks/useMantenimiento';

// ─── Re-seed definitions ──────────────────────────────────────────────────────
const RESEEDS: { which: ReseedWhich; label: string; desc: string }[] = [
  { which: 'ddl', label: 'DDL backfill', desc: 'ALTER TABLE … ADD COLUMN IF NOT EXISTS (shim pre-Alembic)' },
  { which: 'marcas', label: 'Marcas', desc: 'Siembra marcas de catálogo base' },
  { which: 'sat', label: 'Catálogos SAT', desc: 'Productos/servicios SAT (c_ClaveProdServ)' },
  { which: 'sat_unidad', label: 'Unidades SAT', desc: 'Unidades de medida SAT (c_ClaveUnidad)' },
  { which: 'contactos', label: 'Contactos principales', desc: 'Backfill contactos principales de clientes' },
  { which: 'pipeline', label: 'Pipeline CRM', desc: 'Etapas iniciales del pipeline de deals' },
];

// ─── Job definitions ──────────────────────────────────────────────────────────
const JOBS: { which: JobWhich; label: string; desc: string }[] = [
  { which: 'marcar_vencidos', label: 'Marcar CxC vencidas', desc: 'Marca transacciones vencidas en cuentas por cobrar' },
  { which: 'refresh_fx', label: 'Refrescar tipo de cambio', desc: 'Actualiza USD/MXN desde Banxico o fuente pública' },
];

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-emerald-500/20 bg-card overflow-hidden">
      <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/70 px-4 pt-3 pb-2 border-b border-emerald-500/10">
        {title}
      </div>
      <div className="p-4">
        {children}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function MantenimientoPage() {
  const reseed = useReseed();
  const job = useJob();
  const seedCtx = useSeedContext();
  const dropAll = useDropAllTables();

  const [dryRun, setDryRun] = useState(true);
  const [seedContextResult, setSeedContextResult] = useState<unknown>(null);
  const [confirmText, setConfirmText] = useState('');

  const DROP_PHRASE = 'BORRAR TODO';
  const canDrop = confirmText === DROP_PHRASE;

  // ── Handlers ────────────────────────────────────────────────────────────────
  function handleReseed(which: ReseedWhich) {
    reseed.mutate(
      { which },
      {
        onSuccess: (data) => {
          toast({ kind: 'success', title: `Re-seed: ${which}`, description: data.mensaje });
        },
        onError: (e) => {
          toast({ kind: 'error', title: `Error en re-seed: ${which}`, description: normalizeDetail(e?.detail, 'Error desconocido') });
        },
      },
    );
  }

  function handleJob(which: JobWhich) {
    job.mutate(
      { which },
      {
        onSuccess: (data) => {
          const desc = data.ok ? 'Job ejecutado correctamente.' : 'Job completado con advertencias.';
          toast({ kind: data.ok ? 'success' : 'warning', title: `Job: ${which}`, description: desc });
        },
        onError: (e) => {
          toast({ kind: 'error', title: `Error en job: ${which}`, description: normalizeDetail(e?.detail, 'Error desconocido') });
        },
      },
    );
  }

  function handleSeedContext() {
    setSeedContextResult(null);
    seedCtx.mutate(
      { dry_run: dryRun },
      {
        onSuccess: (data) => {
          setSeedContextResult(data);
          toast({
            kind: 'success',
            title: dryRun ? 'Seed-context (dry-run)' : 'Seed-context ejecutado',
            description: 'Ver resultado abajo.',
          });
        },
        onError: (e) => {
          toast({ kind: 'error', title: 'Error en seed-context', description: normalizeDetail(e?.detail, 'Error desconocido') });
        },
      },
    );
  }

  async function handleDropAll() {
    if (!canDrop) return;
    const ok = await confirm({
      titulo: '¿Borrar TODAS las tablas?',
      mensaje:
        'Esta acción es IRREVERSIBLE. Se eliminarán todas las tablas de la base de datos.\n\nEl sistema quedará inutilizable hasta un redeploy con Alembic.',
      confirmLabel: 'Sí, borrar todo',
      cancelLabel: 'Cancelar',
      tono: 'danger',
    });
    if (!ok) return;

    dropAll.mutate(
      { confirm: DROP_PHRASE },
      {
        onSuccess: (data) => {
          toast({
            kind: 'success',
            title: 'Tablas eliminadas',
            description: `${data.count} tablas eliminadas. Redeploy requerido.`,
          });
          setConfirmText('');
        },
        onError: (e) => {
          toast({ kind: 'error', title: 'Error al borrar tablas', description: normalizeDetail(e?.detail, 'Error desconocido') });
        },
      },
    );
  }

  return (
    <PlatformShell title="Datos y mantenimiento">
      <div className="max-w-3xl space-y-6">
        {/* ── Re-seeds ───────────────────────────────────────────────────────── */}
        <Section title="Re-seeds (idempotentes)">
          <p className="font-mono text-[11px] text-muted-foreground mb-4">
            Operaciones seguras de inicialización. Pueden ejecutarse múltiples veces sin efecto secundario.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RESEEDS.map((r) => (
              <div
                key={r.which}
                className="flex flex-col gap-1 p-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">{r.label}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reseed.isPending}
                    onClick={() => handleReseed(r.which)}
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/60 shrink-0"
                  >
                    Ejecutar
                  </Button>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">{r.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Jobs ──────────────────────────────────────────────────────────── */}
        <Section title="Jobs">
          <p className="font-mono text-[11px] text-muted-foreground mb-4">
            Tareas de mantenimiento programables. Se ejecutan en el proceso actual.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {JOBS.map((j) => (
              <div
                key={j.which}
                className="flex flex-col gap-1 p-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">{j.label}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={job.isPending}
                    onClick={() => handleJob(j.which)}
                    className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/60 shrink-0"
                  >
                    Ejecutar
                  </Button>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">{j.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Seed context ──────────────────────────────────────────────────── */}
        <Section title="Ingesta context/">
          <p className="font-mono text-[11px] text-muted-foreground mb-4">
            Ejecuta el seed de contexto desde <code className="text-emerald-400">context/</code>. Usa dry-run para previsualizar sin persistir.
          </p>
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-emerald-500/30 accent-emerald-500"
              />
              <span className="font-mono text-xs text-foreground">Dry-run (preview, sin persistir)</span>
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={seedCtx.isPending}
              onClick={handleSeedContext}
              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/60"
            >
              <Terminal className="h-3.5 w-3.5 mr-1.5" />
              {dryRun ? 'Dry-run preview' : 'Ejecutar seed-context'}
            </Button>
          </div>
          {seedContextResult != null && (
            <div className="rounded-lg border border-emerald-500/20 bg-surface-2 p-3">
              <p className="font-mono text-[10px] text-emerald-500/70 uppercase mb-2">Resultado:</p>
              <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-all overflow-x-auto max-h-80">
                {JSON.stringify(seedContextResult, null, 2)}
              </pre>
            </div>
          )}
        </Section>

        {/* ── ZONA ROJA ─────────────────────────────────────────────────────── */}
        <section className="rounded-xl border-2 border-rose-500/50 bg-rose-950/20 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-rose-500/30 bg-rose-500/10">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            <div>
              <p className="font-mono text-xs font-bold text-rose-400 uppercase tracking-widest">
                Zona roja · Acción destructiva irreversible
              </p>
              <p className="font-mono text-[10px] text-rose-400/70 mt-0.5">
                Esta operación no se puede deshacer. El sistema quedará inoperante.
              </p>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div>
              <p className="font-mono text-sm font-semibold text-rose-300 mb-1">
                Borrar TODAS las tablas de la base de datos
              </p>
              <p className="font-mono text-[11px] text-rose-300/70">
                Ejecuta DROP TABLE en cascada sobre todas las tablas del schema actual. Requiere un
                redeploy con Alembic para recuperar el servicio.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block font-mono text-[11px] text-rose-300/80">
                Para confirmar, escribe exactamente: <code className="text-rose-300 font-bold">BORRAR TODO</code>
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="BORRAR TODO"
                className="font-mono text-sm border-rose-500/40 bg-rose-950/30 text-rose-200 placeholder:text-rose-700 max-w-xs focus-visible:ring-rose-500"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <Button
              variant="destructive"
              size="sm"
              disabled={!canDrop || dropAll.isPending}
              onClick={() => void handleDropAll()}
              className="bg-rose-600 hover:bg-rose-700 disabled:opacity-30"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {dropAll.isPending ? 'Borrando…' : 'Borrar todas las tablas'}
            </Button>
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}
