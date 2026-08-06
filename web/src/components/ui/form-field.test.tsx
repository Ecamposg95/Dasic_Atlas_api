// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FormField } from './form-field';

afterEach(cleanup);

/**
 * Primeras pruebas de componente del repo (jsdom + Testing Library).
 *
 * `FormField` se eligió primero porque su valor entero es accesibilidad: asocia
 * la etiqueta con el control e inyecta `aria-required`. Eso no se puede
 * verificar leyendo el JSX —hay que montarlo y consultarlo como lo haría un
 * lector de pantalla—, que es justo lo que faltaba poder hacer.
 *
 * Las consultas van por rol y por texto accesible, nunca por clase CSS: así la
 * prueba falla cuando se rompe la accesibilidad, no cuando cambia el diseño.
 */
describe('FormField', () => {
  it('asocia la etiqueta con el control aunque el hijo no traiga id', () => {
    render(
      <FormField label="Nombre de la empresa">
        <input />
      </FormField>,
    );
    // getByLabelText solo lo encuentra si htmlFor/id están bien enlazados:
    // es la prueba de que la asociación existe, no de que se haya escrito.
    expect(screen.getByLabelText(/nombre de la empresa/i)).toBeInTheDocument();
  });

  it('respeta el id que ya trae el control', () => {
    render(
      <FormField label="Correo">
        <input id="correo-propio" />
      </FormField>,
    );
    expect(screen.getByLabelText(/correo/i)).toHaveAttribute('id', 'correo-propio');
  });

  it('marca aria-required cuando el campo es obligatorio', () => {
    render(
      <FormField label="RFC" required>
        <input />
      </FormField>,
    );
    expect(screen.getByLabelText(/rfc/i)).toHaveAttribute('aria-required', 'true');
  });

  it('no marca aria-required cuando es opcional', () => {
    render(
      <FormField label="Teléfono">
        <input />
      </FormField>,
    );
    expect(screen.getByLabelText(/teléfono/i)).not.toHaveAttribute('aria-required');
  });

  it('el asterisco no se anuncia: es decoración del "required" real', () => {
    render(
      <FormField label="RFC" required>
        <input />
      </FormField>,
    );
    // Ojo con la API: `getByLabelText` compara el TEXTO de la etiqueta, que
    // sí incluye el "*". El nombre accesible es otra cosa —ahí sí cuenta el
    // `aria-hidden`— y es lo que anuncia un lector de pantalla.
    expect(screen.getByLabelText(/rfc/i)).toHaveAccessibleName('RFC');
  });

  it('muestra el hint, y lo sustituye por el error cuando lo hay', () => {
    const { rerender } = render(
      <FormField label="Monto" hint="Sin IVA">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Sin IVA')).toBeInTheDocument();

    rerender(
      <FormField label="Monto" hint="Sin IVA" error="Debe ser mayor a 0">
        <input />
      </FormField>,
    );
    expect(screen.getByText('Debe ser mayor a 0')).toBeInTheDocument();
    expect(screen.queryByText('Sin IVA')).not.toBeInTheDocument();
  });

  // --- Accesibilidad del error -------------------------------------------
  // Un mensaje de error que solo existe visualmente no llega a quien usa
  // lector de pantalla: al enfocar el input no se anuncia nada y el campo
  // parece válido. `aria-invalid` marca el estado y `aria-describedby` ata el
  // texto al control.
  it('marca el control como inválido cuando hay error', () => {
    render(
      <FormField label="Monto" error="Debe ser mayor a 0">
        <input />
      </FormField>,
    );
    expect(screen.getByLabelText(/monto/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('ata el mensaje de error al control con aria-describedby', () => {
    render(
      <FormField label="Monto" error="Debe ser mayor a 0">
        <input />
      </FormField>,
    );
    const input = screen.getByLabelText(/monto/i);
    expect(input).toHaveAccessibleDescription('Debe ser mayor a 0');
  });

  it('ata también el hint cuando no hay error', () => {
    render(
      <FormField label="Monto" hint="Sin IVA">
        <input />
      </FormField>,
    );
    expect(screen.getByLabelText(/monto/i)).toHaveAccessibleDescription('Sin IVA');
  });

  it('no deja aria-invalid en un campo sano', () => {
    render(
      <FormField label="Monto">
        <input />
      </FormField>,
    );
    expect(screen.getByLabelText(/monto/i)).not.toHaveAttribute('aria-invalid');
  });
});
