import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
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
  // identidad se recupere sin pasar por LoginPage. Si la sesión ya no es válida
  // (401), regresamos al login en vez de dejar un shell roto.
  useEffect(() => {
    if (user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.get<User>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) navigate('/', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, setUser, navigate]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
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
