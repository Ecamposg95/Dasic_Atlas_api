import { describe, expect, it } from 'vitest';
import { fechaLocalISO, fechaLocalISOMas, formatFechaDoc, formatFechaHora } from './fechas';

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


// ---------------------------------------------------------------------------
// formatFechaDoc — el bug de C-2608009
// ---------------------------------------------------------------------------
describe('formatFechaDoc', () => {
  it('no retrocede un día con un timestamptz a medianoche UTC', () => {
    // Es exactamente lo que la API devuelve para `fecha_creacion`. Con
    // `new Date(iso).toLocaleDateString()` en CDMX salía "05 ago".
    expect(formatFechaDoc('2026-08-06T00:00:00+00:00')).toBe('06 ago 2026');
  });

  it('trata igual las tres formas en que viaja una fecha', () => {
    const esperado = '06 ago 2026';
    expect(formatFechaDoc('2026-08-06')).toBe(esperado);
    expect(formatFechaDoc('2026-08-06T00:00:00')).toBe(esperado);
    expect(formatFechaDoc('2026-08-06T00:00:00+00:00')).toBe(esperado);
    // Y con una hora cualquiera: sigue siendo el mismo día del calendario.
    expect(formatFechaDoc('2026-08-06T23:30:00+00:00')).toBe(esperado);
  });

  it('respeta el primero de mes, que es donde más se nota el corrimiento', () => {
    // El abreviado del mes varía entre versiones de ICU ('sep' / 'sept'), así
    // que se afirma lo que importa —día, mes y año— sin atarse a esa cadena.
    const salida = formatFechaDoc('2026-09-01T00:00:00+00:00');
    expect(salida).toMatch(/^01 sept?\.? 2026$/);
  });

  it('respeta el 1 de enero: un día de desfase cambia el AÑO', () => {
    expect(formatFechaDoc('2027-01-01T00:00:00+00:00')).toBe('01 ene 2027');
  });

  it('acepta un formato propio', () => {
    expect(formatFechaDoc('2026-08-06', { day: '2-digit', month: '2-digit', year: 'numeric' }))
      .toBe('06/08/2026');
  });

  it('sin valor o con basura devuelve raya, no "Invalid Date"', () => {
    expect(formatFechaDoc(null)).toBe('—');
    expect(formatFechaDoc(undefined)).toBe('—');
    expect(formatFechaDoc('')).toBe('—');
    expect(formatFechaDoc('no es fecha')).toBe('—');
  });
});

describe('formatFechaHora', () => {
  it('un instante SÍ se convierte a la hora local: ahí es lo correcto', () => {
    // 2026-08-06 17:57 UTC = 11:57 en CDMX. La suite corre en esa zona.
    expect(formatFechaHora('2026-08-06T17:57:00+00:00')).toContain('11:57');
  });

  it('sin valor devuelve raya', () => {
    expect(formatFechaHora(null)).toBe('—');
    expect(formatFechaHora('cualquier cosa')).toBe('—');
  });
});
