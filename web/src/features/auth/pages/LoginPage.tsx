import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowRight, AlertCircle, Loader2, Check } from 'lucide-react';
import { api, normalizeDetail } from '@/lib/api';
import { branding } from '@/lib/branding';
import { useAuth, type User } from '@/stores/auth';

const VENTAJAS = branding.loginBullets;
const CREDITO = `Powered by ${branding.poweredBy} · ${branding.productName} ${branding.productVersion}`;

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const setUser = useAuth((s) => s.setUser);

  // Si ya hay cookie válida, redirigir directo al dashboard (matching el
  // comportamiento previo de Jinja `view_login` que hacía RedirectResponse).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.get<User>('/api/auth/me');
        if (cancelled) return;
        setUser(me);
        navigate('/spa/dashboard', { replace: true });
      } catch {
        // 401 esperado si no hay sesión — mantener login visible.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, setUser]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // El endpoint /api/auth/login espera form-urlencoded (OAuth2PasswordRequestForm),
      // no JSON. El wrapper `api.post` hardcodea Content-Type: application/json,
      // así que aquí usamos `fetch` directo y normalizamos el detail con la
      // misma función que el wrapper para evitar React #31 cuando 422 trae
      // un array de errores Pydantic.
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: email, password, remember: String(remember) }).toString(),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { detail?: unknown };
        setError(normalizeDetail(body.detail, 'Credenciales incorrectas'));
        setBusy(false);
        return;
      }
      const me = await api.get<User>('/api/auth/me');
      setUser(me);
      navigate('/spa/dashboard', { replace: true });
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
      setBusy(false);
    }
  }

  const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.currentTarget as HTMLImageElement).style.display = 'none';
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ── Panel de marca (solo desktop) — deliberadamente oscuro en ambos temas ── */}
      <aside className="relative hidden lg:flex lg:w-[46%] flex-col justify-between overflow-hidden p-12 bg-[#121212] text-slate-100">
        {/* Glow del acento */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-accent-glow/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent-deep/20 blur-3xl" />
        {/* Retícula industrial */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        {/* Línea de acento superior */}
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-accent-glow via-accent-deep to-transparent" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent-glow to-accent-deep flex items-center justify-center shadow-glow-accent">
            <span className="text-base font-black text-slate-950">{branding.organizationName.charAt(0)}</span>
          </div>
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={branding.organizationName}
              className="h-12 w-auto object-contain drop-shadow-2xl"
              onError={hideOnError}
            />
          )}
        </div>

        <div className="relative z-10 max-w-md">
          <p className="text-[11px] uppercase tracking-[0.3em] text-accent-glow font-semibold mb-3">
            {branding.tagline}
          </p>
          <h2 className="text-[42px] leading-[1.05] font-bold tracking-tight">
            {branding.productName}
          </h2>
          <p className="mt-5 text-lg text-slate-300 leading-relaxed">{branding.loginHeadline}</p>
          <ul className="mt-8 space-y-3.5">
            {VENTAJAS.map((v) => (
              <li key={v} className="flex items-center gap-3 text-slate-300">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-glow/15 text-accent-glow border border-accent-glow/20">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {v}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-[11px] text-slate-500">{CREDITO}</p>
      </aside>

      {/* ── Panel del formulario (theme-aware) ─────────────────────────── */}
      <main className="flex flex-1 items-center justify-center p-6 sm:p-10 app-canvas">
        <div className="w-full max-w-sm">
          {/* Marca compacta (solo móvil) */}
          <div className="lg:hidden mb-8 flex flex-col items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-accent-glow to-accent-deep flex items-center justify-center shadow-glow-accent">
              <span className="text-base font-black text-slate-950">{branding.organizationName.charAt(0)}</span>
            </div>
            {branding.logoUrl && (
              <img
                src={branding.logoUrl}
                alt={branding.organizationName}
                className="h-12 w-auto object-contain"
                onError={hideOnError}
              />
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-elev-3 p-7">
            <div className="mb-6">
              <h1 className="text-xl font-bold tracking-tight">Bienvenido de vuelta</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Inicia sesión en {branding.productName}
              </p>
            </div>

            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder={branding.emailPlaceholder}
                  className="w-full bg-background border border-border text-foreground placeholder:text-muted-foreground/60 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-glow focus:ring-1 focus:ring-accent-glow/40 transition"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full bg-background border border-border text-foreground placeholder:text-muted-foreground/60 rounded-lg px-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-accent-glow focus:ring-1 focus:ring-accent-glow/40 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 accent-accent-glow"
                />
                Recordar sesión en este equipo
              </label>

              <button
                type="submit"
                disabled={busy}
                className="mt-2 w-full flex items-center justify-center gap-2 bg-accent-glow hover:bg-accent-glow/90 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm py-2.5 rounded-lg transition-all shadow-elev-1 hover:shadow-glow-accent active:scale-[0.98]"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verificando…</span>
                  </>
                ) : (
                  <>
                    <span>Ingresar al sistema</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="mt-8 text-center text-[10px] text-muted-foreground/70 lg:hidden">{CREDITO}</p>
        </div>
      </main>
    </div>
  );
}
