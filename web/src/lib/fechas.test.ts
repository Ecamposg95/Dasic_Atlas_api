import { describe, expect, it } from 'vitest';
import { fechaLocalISO, fechaLocalISOMas } from './fechas';

// Las fechas se construyen con `new Date(año, mes, día, hora)`, que interpreta
// los argumentos en la zona LOCAL del runner. Por eso los asserts valen en
// cualquier zona horaria: no dependen de que CI corra en UTC ni en CDMX.
describe('fechaLocalISO', () => {
  it('usa el día del calendario local, no el de UTC', () => {
    // 19:00 local. En CDMX (UTC−6) en UTC ya es el día 6: `toISOString()`
    // devolvería '2026-08-06' y esa era exactamente la fecha equivocada con la
    // que nacían las cotizaciones capturadas de tarde.
    expect(fechaLocalISO(new Date(2026, 7, 5, 19, 0))).toBe('2026-08-05');
  });

  it('respeta el mismo día a primera hora', () => {
    expect(fechaLocalISO(new Date(2026, 7, 5, 0, 30))).toBe('2026-08-05');
  });

  it('rellena mes y día con cero a la izquierda', () => {
    // Enero es mes 0: sin padStart saldría '2026-1-9'.
    expect(fechaLocalISO(new Date(2026, 0, 9, 12, 0))).toBe('2026-01-09');
  });

  it('no adelanta el día en el último instante local de la jornada', () => {
    expect(fechaLocalISO(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});

describe('fechaLocalISOMas', () => {
  it('suma los días de vigencia por defecto (15)', () => {
    // 5 + 15 = 20 de agosto.
    expect(fechaLocalISOMas(15, new Date(2026, 7, 5, 19, 0))).toBe('2026-08-20');
  });

  it('cruza el fin de mes', () => {
    // Agosto tiene 31 días: 25 + 15 = 40 → 9 de septiembre.
    expect(fechaLocalISOMas(15, new Date(2026, 7, 25, 10, 0))).toBe('2026-09-09');
  });

  it('cruza el fin de año', () => {
    // Diciembre tiene 31: 28 + 15 = 43 → 12 de enero del año siguiente.
    expect(fechaLocalISOMas(15, new Date(2026, 11, 28, 10, 0))).toBe('2027-01-12');
  });

  it('cruza el 29 de febrero de un año bisiesto', () => {
    // 2028 es bisiesto: 28-feb + 1 día = 29-feb, no 1-mar.
    expect(fechaLocalISOMas(1, new Date(2028, 1, 28, 10, 0))).toBe('2028-02-29');
  });

  it('no muta la fecha que recibe', () => {
    const original = new Date(2026, 7, 5, 19, 0);
    fechaLocalISOMas(15, original);
    expect(fechaLocalISO(original)).toBe('2026-08-05');
  });
});
