import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuth, type User } from '@/stores/auth';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Footer } from './Footer';

const COLLAPSE_KEY = 'atlas-sidebar-collapsed';

export function Layout() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  // Los tres reintentos se agotaron sin que el servidor respondiera ni 401 ni
  // 403: no sabemos si la sesión sigue viva, así que ni entramos ni echamos al
  // usuario. `reintento` es la palanca que vuelve a disparar el efecto.
  const [falloSesion, setFalloSesion] = useState(false);
  const [reintento, setReintento] = useState(0);

  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1');
      return !v;
    });
  }

  // El store Zustand vive en memoria: tras un refresh o una navegación directa
  // a una ruta protegida, `user` arranca en null y el Header pierde los botones
  // de usuario/logout aunque la cookie `access_token` siga válida. Rehidratamos
  // aquí —al nivel que envuelve todas las páginas protegidas— para que la
  // identidad se recupere sin pasar por LoginPage.
  //
  // Antes CUALQUIER fallo mandaba al login: un 500, un timeout o el arranque en
  // frío del servidor te sacaban igual que una sesión caducada, y al volver a
  // entrar aterrizabas en el dashboard en vez de en la ruta que habías pedido.
  // Solo un 401 (sin sesión) o un 403 (usuario desactivado) significan de
  // verdad que no puedes pasar; lo demás es transitorio y se reintenta.
  useEffect(() => {
    if (user) return;
    let cancelado = false;
    (async () => {
      for (let intento = 0; intento < 3; intento++) {
        try {
          const me = await api.get<User>('/api/auth/me');
          if (!cancelado) {
            setUser(me);
            setFalloSesion(false);
          }
          return;
        } catch (e) {
          // Un fallo de red lanza un TypeError sin `status`; solo los errores
          // HTTP traen `ApiError`. Por eso se compara el status y no se trata
          // todo lo capturado como "no autenticado".
          const status = (e as { status?: number }).status;
          if (status === 401 || status === 403) {
            if (!cancelado) navigate('/', { replace: true });
            return;
          }
          if (cancelado) return;
          if (intento < 2) {
            await new Promise((r) => setTimeout(r, 400 * 2 ** intento));
          }
        }
      }
      if (!cancelado) setFalloSesion(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [user, setUser, navigate, reintento]);

  if (falloSesion) {
    return (
      <div className="app-frame flex items-center justify-center bg-background text-foreground p-6">
        <div
          role="alert"
          className="max-w-md w-full rounded-md border border-border bg-card p-6 text-center space-y-3"
        >
          <WifiOff className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden="true" />
          <h1 className="text-base font-semibold">No pudimos verificar tu sesión</h1>
          <p className="text-sm text-muted-foreground">
            El servidor no respondió tras varios intentos. Tu sesión probablemente sigue
            activa: no hace falta volver a entrar.
          </p>
          <div className="flex gap-2 justify-center pt-1">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setFalloSesion(false);
                setReintento((n) => n + 1);
              }}
            >
              Reintentar
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => navigate('/', { replace: true })}>
              Ir al inicio de sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-frame flex overflow-hidden bg-background text-foreground">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto app-canvas">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
