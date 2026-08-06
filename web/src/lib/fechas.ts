/**
 * Fecha de calendario **local**, en formato `YYYY-MM-DD`.
 *
 * Existe porque `new Date().toISOString().slice(0, 10)` devuelve la fecha en
 * UTC, no la del usuario. En CDMX (UTC−6) eso significa que a partir de las
 * 18:00 hora local el día en UTC ya avanzó: una cotización capturada el 5 de
 * agosto a las 19:00 nacía fechada el 6. El error nunca se ve en horario de
 * oficina temprano, lo que lo vuelve especialmente difícil de reproducir.
 *
 * Úsese siempre que el valor represente un **día del calendario** —fecha de
 * documento, vigencia, tipo de cambio del día, nombre de archivo—. Para un
 * **instante** (un timestamp de auditoría, la hora de un recordatorio)
 * `toISOString()` es lo correcto y no debe sustituirse: ahí el punto es
 * justamente normalizar a UTC.
 */
export function fechaLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/** `fechaLocalISO` desplazada N días, respetando meses y años (usa `setDate`). */
export function fechaLocalISOMas(dias: number, desde: Date = new Date()): string {
  const d = new Date(desde);
  d.setDate(d.getDate() + dias);
  return fechaLocalISO(d);
}

/**
 * Formatea una **fecha de calendario** que viene del backend, sin desplazarla.
 *
 * El backend manda estos campos de tres formas distintas, y las tres significan
 * lo mismo — un día del calendario:
 *
 *   "2026-08-06"                    (date)
 *   "2026-08-06T00:00:00"           (timestamp sin zona)
 *   "2026-08-06T00:00:00+00:00"     (timestamptz — así viaja `fecha_creacion`)
 *
 * `new Date(iso).toLocaleDateString()` trata el valor como un INSTANTE y lo
 * convierte a la zona del navegador. Para el tercer caso eso es restarle seis
 * horas a la medianoche UTC y aterrizar en el día anterior: el documento
 * C-2608009 salía fechado el 6 en el PDF y el 5 en el listado.
 *
 * Aquí se toma la parte de FECHA de la cadena y se formatea tal cual, sin
 * construir un instante. NO aplica a marcas de tiempo reales —cuándo se generó
 * un PDF, cuándo se escribió una nota—: ésas sí son instantes y deben
 * convertirse a hora local. Para eso está `formatFechaHora`.
 */
export function formatFechaDoc(
  iso: string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '—';
  const [, y, mes, d] = m;
  // Mediodía local: inmune al horario de verano y a cualquier desfase, porque
  // ningún cambio de zona mueve el mediodía a otro día.
  return new Date(Number(y), Number(mes) - 1, Number(d), 12).toLocaleDateString('es-MX', opciones);
}

/**
 * Formatea un **instante** (cuándo ocurrió algo) en la hora local de quien mira.
 * Aquí convertir la zona es lo correcto, no un defecto.
 */
export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX');
}
