'use strict';

/**
 * Devuelve el timestamp ISO (UTC) del inicio del día actual, en el mismo
 * formato que usa src/db/schema.sql (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')).
 * Se usa para filtrar estadísticas "de hoy" en telemetría y en el panel
 * de administración. Nota: el corte de día es en UTC, no en la zona
 * horaria local del operador del nodo.
 */
function inicioDeHoyUTC() {
  const ahora = new Date();
  const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  return inicio.toISOString();
}

module.exports = { inicioDeHoyUTC };
