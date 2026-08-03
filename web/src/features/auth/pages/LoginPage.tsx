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
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* ── Panel de marca (solo desktop) ───────────────────────────── */}
      <aside className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden p-12 bg-gradient-to-br from-slate-900 via-slate-950 to-black">
        {/* Blobs de glow del acento */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-accent-glow/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent-glow/10 blur-3xl" />
        {/* Grid sutil */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative z-10">
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={branding.organizationName}
              className="h-16 w-auto object-contain drop-shadow-2xl"
              onError={hideOnError}
            />
          )}
        </div>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold tracking-tight">{branding.productName}</h2>
          <p className="mt-2 text-slate-400">{branding.tagline} <span className="text-accent-glow">·</span> {branding.organizationName}</p>
          <p className="mt-6 text-lg text-slate-300 leading-relaxed">
            {branding.loginHeadline}
          </p>
          <ul className="mt-8 space-y-3">
            {VENTAJAS.map((v) => (
              <li key={v} className="flex items-center gap-3 text-slate-300">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-glow/15 text-accent-glow">
                  <Check className="h-3.5 w-3.5" />
                </span>
                {v}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-[11px] text-slate-600">{CREDITO}</p>
      </aside>

      {/* ── Panel del formulario ────────────────────────────────────── */}
      <main className="flex flex-1 items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Logo compacto (solo móvil) */}
          {branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt={branding.organizationName}
              className="mx-auto mb-8 h-14 w-auto object-contain lg:hidden"
              onError={hideOnError}
            />
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Bienvenido de vuelta</h1>
            <p className="mt-1 text-sm text-slate-400">Inicia sesión en {branding.productName}</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
                className="w-full bg-slate-800/60 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent-glow focus:ring-1 focus:ring-accent-glow/40 transition"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wider">
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
                  className="w-full bg-slate-800/60 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-3 pr-10 py-2.5 text-sm focus:outline-none focus:border-accent-glow focus:ring-1 focus:ring-accent-glow/40 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
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
              className="mt-2 w-full flex items-center justify-center gap-2 bg-accent-glow hover:bg-accent-glow/90 disabled:bg-slate-700 disabled:cursor-not-allowed text-slate-900 font-semibold text-sm py-2.5 rounded-lg transition-all shadow-lg hover:shadow-accent-glow/30 active:scale-[0.98]"
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

          <p className="mt-10 text-center text-[10px] text-slate-600 lg:hidden">{CREDITO}</p>
        </div>
      </main>
    </div>
  );
}
