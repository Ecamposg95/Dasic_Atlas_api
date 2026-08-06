// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { QueryError } from './query-error';

afterEach(cleanup);

describe('QueryError', () => {
  it('se anuncia como alerta', () => {
    render(<QueryError />);
    // `role="alert"` es lo que hace que un lector de pantalla lo lea al
    // aparecer; sin él, la página cambia en silencio.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('ofrece reintentar y llama al callback', async () => {
    const onRetry = vi.fn();
    render(<QueryError onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('sin callback no dibuja el botón', () => {
    render(<QueryError />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('un 403 no ofrece reintentar', () => {
    // Decisión de diseño, no descuido: un 403 es una respuesta, no un fallo.
    // Invitar a reintentar algo que nunca va a funcionar es peor que callar.
    render(<QueryError error={{ status: 403 }} onRetry={() => {}} />);

    expect(screen.getByText(/no tienes acceso/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it('muestra el detalle que manda el backend', () => {
    render(<QueryError error={{ status: 500, detail: 'La base de datos no responde' }} />);
    expect(screen.getByText('La base de datos no responde')).toBeInTheDocument();
  });

  it('sin detalle cae a un mensaje honesto y no a uno inventado', () => {
    render(<QueryError error={{ status: 500 }} />);
    expect(screen.getByText(/falla temporal de conexión/i)).toBeInTheDocument();
  });

  it('acepta un título propio', () => {
    render(<QueryError title="No se pudo cargar el kardex" />);
    expect(screen.getByRole('heading', { name: /no se pudo cargar el kardex/i })).toBeInTheDocument();
  });

  it('en modo fila produce HTML válido para un tbody', () => {
    // Un <div> dentro de <tbody> es HTML inválido y el navegador lo expulsa de
    // la tabla: por eso existe `asRow`. Se monta dentro de una tabla real para
    // que la prueba lo verifique de verdad.
    render(
      <table>
        <tbody>
          <QueryError asRow colSpan={5} />
        </tbody>
      </table>,
    );
    const celda = screen.getByRole('cell');
    expect(celda).toHaveAttribute('colspan', '5');
    expect(celda.closest('tr')).toBeInTheDocument();
  });
});
