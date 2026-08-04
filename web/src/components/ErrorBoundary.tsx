import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: unknown) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-foreground mb-3">
              Algo se rompió
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              La aplicación encontró un error inesperado. Recarga para intentar de nuevo.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-semibold hover:opacity-90"
            >
              Recargar
            </button>
            {this.state.error && (
              <pre className="mt-6 text-left text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-lg overflow-auto max-h-40">
                {String(this.state.error.message ?? this.state.error)}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
