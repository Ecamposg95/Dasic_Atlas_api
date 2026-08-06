// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { GastoFormModal } from './GastoFormModal';

afterEach(cleanup);

/**
 * Validación de un formulario de entidad, extremo a extremo dentro del modal.
 *
 * Lo que se prueba no es el markup sino el **contrato con el usuario**: que un
 * dato inválido no llegue al servidor, que el motivo se diga en pantalla, y
 * que lo válido pase con la forma correcta. Las consultas van por etiqueta y
 * por rol, así que si alguien rompe la asociación label→input la prueba cae
 * aunque el diseño siga viéndose igual.
 */
function montar(props: Partial<React.ComponentProps<typeof GastoFormModal>> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <GastoFormModal
      mode="create"
      categorias={['Papelería', 'Renta']}
      onSave={onSave}
      onClose={onClose}
      busy={false}
      {...props}
    />,
  );
  return { onSave, onClose };
}

// El botón de envío cambia de texto según el modo ('Registrar gasto' /
// 'Guardar cambios') y mientras envía ('Guardando…'). Se busca por su tipo
// dentro del form, que es lo estable.
const guardar = () => screen.getByRole('button', { name: /registrar gasto|guardar cambios/i });

describe('GastoFormModal — validación', () => {
  it('no guarda sin categoría y dice por qué', async () => {
    const { onSave } = montar();

    await userEvent.click(guardar());

    expect(screen.getByText(/categoría es requerida/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('no guarda sin monto', async () => {
    // Ojo con el reparto de responsabilidades: el input declara `min="0.01"`,
    // así que un 0 o un negativo los bloquea la validación nativa del
    // navegador ANTES de que se dispare el submit — la comprobación en JS
    // nunca llega a verlos. Lo que sí le toca cubrir es el campo vacío, que
    // para HTML es válido (no es `required`) y para el negocio no.
    const { onSave } = montar();
    await userEvent.selectOptions(screen.getByLabelText(/categoría/i), 'Papelería');

    await userEvent.click(guardar());

    expect(screen.getByText(/mayor a 0/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('corta la categoría en los 80 caracteres que exige el backend', async () => {
    // Sin este límite en el cliente, pasarse devolvía un 422 con el mensaje
    // crudo de Pydantic. El backend lo declara en `GastoCreate`.
    const { onSave } = montar();
    await userEvent.selectOptions(screen.getByLabelText(/categoría/i), '__nueva__');
    await userEvent.type(screen.getByLabelText(/nueva categoría/i), 'x'.repeat(81));
    await userEvent.type(screen.getByLabelText(/monto/i), '100');

    await userEvent.click(guardar());

    expect(screen.getByText(/80 caracteres/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('acepta exactamente 80 caracteres', async () => {
    const { onSave } = montar();
    await userEvent.selectOptions(screen.getByLabelText(/categoría/i), '__nueva__');
    await userEvent.type(screen.getByLabelText(/nueva categoría/i), 'x'.repeat(80));
    await userEvent.type(screen.getByLabelText(/monto/i), '100');

    await userEvent.click(guardar());

    expect(onSave).toHaveBeenCalledOnce();
  });

  it('guarda lo válido con la forma que espera el backend', async () => {
    const { onSave } = montar();
    await userEvent.selectOptions(screen.getByLabelText(/categoría/i), 'Renta');
    await userEvent.type(screen.getByLabelText(/monto/i), '1500.50');

    await userEvent.click(guardar());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: 'Renta', monto: 1500.5, moneda: 'MXN' }),
    );
  });

  it('el modal se puede cerrar sin guardar', async () => {
    const { onSave, onClose } = montar();

    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
