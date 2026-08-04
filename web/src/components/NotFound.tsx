import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
        <Compass className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold text-foreground">Página no encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        La ruta <code className="font-mono text-foreground/80">{pathname}</code> no existe o fue movida.
      </p>
      <Link
        to="/spa/dashboard"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
      >
        Ir al dashboard
      </Link>
    </div>
  );
}
