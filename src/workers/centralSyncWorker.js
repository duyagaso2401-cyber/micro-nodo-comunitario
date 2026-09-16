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
const { estaDisponible } = require('../config/centralDatabase');
const centralRepository = require('../repositories/centralRepository');
const transaccionesRepository = require('../repositories/transaccionesRepository');
const logSincronizacionRepository = require('../repositories/logSincronizacionRepository');

let sincronizacionEnCurso = false;

async function sincronizarAhora() {
  if (!env.CENTRAL_SYNC_HABILITADO || !estaDisponible()) return;
  if (sincronizacionEnCurso) return;

  sincronizacionEnCurso = true;
  const inicio = Date.now();

  try {
    const lote = await transaccionesRepository.listarNoSincronizadasConCentral(env.CENTRAL_SYNC_LOTE_MAX);
    if (lote.length === 0) return; // nada que hacer, no se registra log para no llenarlo de ruido

    await centralRepository.upsertNodo();
    await centralRepository.insertarLoteTransacciones(lote);
    await transaccionesRepository.marcarSincronizadasConCentral(lote.map((t) => t.id));

    const duracionMs = Date.now() - inicio;
    logger.info('centralSyncWorker', `Sincronizadas ${lote.length} transacción(es) con la central en ${duracionMs}ms.`);
    await logSincronizacionRepository.registrarEjecucion({
      tipo: 'transacciones_central',
      estado: 'exito',
      detalle: `${lote.length} transacción(es) enviadas.`,
      registrosProcesados: lote.length,
      duracionMs,
    });
  } catch (err) {
    logger.error('centralSyncWorker', 'Error sincronizando transacciones con la central:', err.message);
    await logSincronizacionRepository
      .registrarEjecucion({
        tipo: 'transacciones_central',
        estado: 'error',
        detalle: err.message,
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
