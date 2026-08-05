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
