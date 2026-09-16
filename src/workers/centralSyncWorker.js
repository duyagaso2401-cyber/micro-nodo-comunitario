'use strict';

/**
 * Worker de sincronización de transacciones hacia el backend central
 * (Neon/Supabase). Envía en lotes las filas de `transacciones` que aún no
 * se han confirmado en la central, y es seguro de reintentar: la
 * restricción UNIQUE (nodo_id, transaccion_local_id) en Postgres hace que
 * reenviar una fila ya recibida no la duplique.
 *
 * Se dispara de dos formas (ver src/server.js y src/services/pinService.js):
 *   1. Periódicamente, vía node-cron (CENTRAL_SYNC_CRON_EXPRESION).
 *   2. Justo después de validar un PIN, en segundo plano (fire-and-forget),
 *      para que el registro llegue a la central casi en tiempo real cuando
 *      hay conexión, sin bloquear la respuesta al cliente que está
 *      descargando.
 *
 * Si CENTRAL_DATABASE_URL no está configurada, o si el nodo está
 * momentáneamente sin el enlace de respaldo (4G/IoT), esta función falla
 * en silencio (o registra el error) y las transacciones quedan
 * pendientes para el siguiente ciclo — el negocio local (PINs, descargas)
 * nunca depende de que la central esté disponible.
 */

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const centralDatabase = require('../config/centralDatabase');
const centralRepository = require('../repositories/centralRepository');
const transaccionesRepository = require('../repositories/transaccionesRepository');
const logSincronizacionRepository = require('../repositories/logSincronizacionRepository');

let sincronizacionEnCurso = false;

/**
 * @param {{esCorridaInicial?: boolean}} [opciones] `esCorridaInicial: true`
 *   solo cambia el texto de los logs (para distinguir en la tabla
 *   `log_sincronizacion` la corrida de prueba del arranque de las corridas
 *   periódicas normales).
 */
async function sincronizarAhora({ esCorridaInicial = false } = {}) {
  // estaDisponible() relee CENTRAL_DATABASE_URL en caliente en cada
  // llamada (ver config/centralDatabase.js), así que un cambio en la
  // variable de entorno (o su primera configuración) se refleja aquí sin
  // reiniciar el proceso.
  if (!env.CENTRAL_SYNC_HABILITADO || !centralDatabase.estaDisponible()) return;
  if (sincronizacionEnCurso) return;

  sincronizacionEnCurso = true;
  const inicio = Date.now();
  const sufijoCorrida = esCorridaInicial ? ' (corrida inicial de arranque)' : '';

  try {
    const lote = await transaccionesRepository.listarNoSincronizadasConCentral(env.CENTRAL_SYNC_LOTE_MAX);
    if (lote.length === 0) {
      centralDatabase.registrarExito();
      return; // nada que hacer, no se registra log para no llenarlo de ruido
    }

    await centralRepository.upsertNodo();
    await centralRepository.insertarLoteTransacciones(lote);
    await transaccionesRepository.marcarSincronizadasConCentral(lote.map((t) => t.id));

    centralDatabase.registrarExito();

    const duracionMs = Date.now() - inicio;
    logger.info(
      'centralSyncWorker',
      `Sincronizadas ${lote.length} transacción(es) con la central en ${duracionMs}ms${sufijoCorrida}.`
    );
    await logSincronizacionRepository.registrarEjecucion({
      tipo: 'transacciones_central',
      estado: 'exito',
      detalle: `${lote.length} transacción(es) enviadas.${sufijoCorrida}`,
      registrosProcesados: lote.length,
      duracionMs,
    });
  } catch (err) {
    centralDatabase.registrarFallo();
    logger.error('centralSyncWorker', `Error sincronizando transacciones con la central${sufijoCorrida}:`, err.message);
    await logSincronizacionRepository
      .registrarEjecucion({
        tipo: 'transacciones_central',
        estado: 'error',
        detalle: `${err.message}${sufijoCorrida}`,
        duracionMs: Date.now() - inicio,
      })
      .catch(() => {}); // si hasta el log local falla, no queremos otra excepción no controlada
  } finally {
    sincronizacionEnCurso = false;
  }
}

function iniciarProgramador() {
  if (!env.CENTRAL_SYNC_HABILITADO) {
    logger.info('centralSyncWorker', 'Sincronización con la central deshabilitada (CENTRAL_SYNC_HABILITADO=false).');
    return null;
  }
  if (!cron.validate(env.CENTRAL_SYNC_CRON_EXPRESION)) {
    logger.error(
      'centralSyncWorker',
      `Expresión cron inválida: "${env.CENTRAL_SYNC_CRON_EXPRESION}". Programador no iniciado.`
    );
    return null;
  }

  // Corrida de prueba inmediata al arrancar (fire-and-forget, no bloquea
  // app.listen()): así un problema de configuración de la central (URL mal
  // escrita, credenciales vencidas, tabla faltante) queda visible en
  // log_sincronizacion desde el arranque del nodo, en vez de recién en el
  // primer disparo del cron (hasta CENTRAL_SYNC_CRON_EXPRESION después).
  sincronizarAhora({ esCorridaInicial: true }).catch((err) =>
    logger.error('centralSyncWorker', 'Fallo no controlado en la corrida inicial:', err)
  );

  const tarea = cron.schedule(env.CENTRAL_SYNC_CRON_EXPRESION, () => {
    sincronizarAhora().catch((err) => logger.error('centralSyncWorker', 'Fallo no controlado:', err));
  });

  logger.info(
    'centralSyncWorker',
    `Programador de sincronización central iniciado ("${env.CENTRAL_SYNC_CRON_EXPRESION}", lotes de hasta ${env.CENTRAL_SYNC_LOTE_MAX}).`
  );
  return tarea;
}

/** Dispara una sincronización en segundo plano sin esperar el resultado. */
function sincronizarEnSegundoPlano() {
  sincronizarAhora().catch((err) => logger.error('centralSyncWorker', 'Fallo en sincronización en segundo plano:', err));
}

module.exports = { sincronizarAhora, iniciarProgramador, sincronizarEnSegundoPlano };
