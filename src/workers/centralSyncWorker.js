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

// Códigos de error de Node/libuv típicos de "no hay internet / no se pudo
// llegar a la central" (enlace caído, DNS sin resolver, timeout de red,
// conexión rechazada o reseteada a mitad de camino). Se usan para dar un
// mensaje más claro en el log y en la respuesta del botón "Sincronizar
// ahora", y para que quede explícito que ESTE es el caso que nunca debe
// marcar transacciones como sincronizadas (ver más abajo).
const CODIGOS_ERROR_RED = new Set([
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
]);

function esErrorDeRed(err) {
  return Boolean(err && CODIGOS_ERROR_RED.has(err.code));
}

function describirError(err) {
  return esErrorDeRed(err) ? `Sin conexión con la central (${err.code}): ${err.message}` : err.message;
}

/**
 * @param {{esCorridaInicial?: boolean, esManual?: boolean}} [opciones]
 *   `esCorridaInicial: true` solo cambia el texto de los logs (corrida de
 *   prueba del arranque vs. periódicas normales). `esManual: true` es para
 *   el botón "Sincronizar ahora" del panel /admin: además de anotarlo en el
 *   log, hace que las omisiones (central no configurada, sincronización ya
 *   en curso) también se registren y que la función devuelva un resultado
 *   legible para mostrarlo en la respuesta HTTP — las corridas de fondo
 *   (cron / tras validar un PIN) ignoran ese valor de retorno.
 * @returns {Promise<{ok: boolean, procesados?: number, omitido?: string, error?: string, mensaje?: string}>}
 */
async function sincronizarAhora({ esCorridaInicial = false, esManual = false } = {}) {
  const sufijo = esManual ? ' (disparada manualmente desde /admin)' : esCorridaInicial ? ' (corrida inicial de arranque)' : '';

  // estaDisponible() relee CENTRAL_DATABASE_URL en caliente en cada
  // llamada (ver config/centralDatabase.js), así que un cambio en la
  // variable de entorno (o su primera configuración) se refleja aquí sin
  // reiniciar el proceso.
  if (!env.CENTRAL_SYNC_HABILITADO || !centralDatabase.estaDisponible()) {
    const mensaje = !env.CENTRAL_SYNC_HABILITADO
      ? 'La sincronización con la central está deshabilitada (CENTRAL_SYNC_HABILITADO=false).'
      : 'La central no está configurada o no se pudo conectar (revisa CENTRAL_DATABASE_URL).';
    if (esManual) {
      await logSincronizacionRepository
        .registrarEjecucion({ tipo: 'transacciones_central', estado: 'omitido', detalle: `${mensaje}${sufijo}` })
        .catch(() => {});
    }
    return { ok: false, error: 'central_no_disponible', mensaje };
  }

  if (sincronizacionEnCurso) {
    const mensaje = 'Ya hay una sincronización con la central en curso; esperá a que termine e intentá de nuevo.';
    if (esManual) {
      await logSincronizacionRepository
        .registrarEjecucion({ tipo: 'transacciones_central', estado: 'omitido', detalle: `${mensaje}${sufijo}` })
        .catch(() => {});
    }
    return { ok: false, error: 'sincronizacion_en_curso', mensaje };
  }

  sincronizacionEnCurso = true;
  const inicio = Date.now();
  let resultado;

  try {
    const lote = await transaccionesRepository.listarNoSincronizadasConCentral(env.CENTRAL_SYNC_LOTE_MAX);
    if (lote.length === 0) {
      centralDatabase.registrarExito();
      resultado = { ok: true, procesados: 0, mensaje: 'No hay transacciones pendientes por sincronizar.' };
      // No se registra en log_sincronizacion para no llenarlo de ruido en
      // las corridas de fondo, salvo cuando el admin lo disparó a mano.
      if (esManual) {
        await logSincronizacionRepository
          .registrarEjecucion({ tipo: 'transacciones_central', estado: 'omitido', detalle: `${resultado.mensaje}${sufijo}` })
          .catch(() => {});
      }
    } else {
      // IMPORTANTE: marcarSincronizadasConCentral() SOLO se llama si las dos
      // líneas anteriores (upsertNodo + insertarLoteTransacciones) terminaron
      // sin lanzar. Si la central no responde (sin internet, timeout, DNS,
      // credenciales vencidas, etc.) la excepción salta directo al catch de
      // abajo y esta línea nunca se ejecuta: las transacciones del lote
      // siguen con sincronizado_central=0 ("pendiente") en la base local, tal
      // cual estaban, listas para reintentarse en la siguiente ventana de
      // conexión (próximo disparo del cron, tras el próximo PIN validado, o
      // con este mismo botón "Sincronizar ahora"). Además
      // insertarLoteTransacciones() usa ON CONFLICT DO NOTHING sobre
      // (nodo_id, transaccion_local_id), así que reenviar un lote que la
      // central sí llegó a recibir (pero cuya confirmación no volvió a
      // tiempo) tampoco duplica nada — el reintento es seguro.
      await centralRepository.upsertNodo();
      await centralRepository.insertarLoteTransacciones(lote);
      await transaccionesRepository.marcarSincronizadasConCentral(lote.map((t) => t.id));

      centralDatabase.registrarExito();

      const duracionMs = Date.now() - inicio;
      logger.info('centralSyncWorker', `Sincronizadas ${lote.length} transacción(es) con la central en ${duracionMs}ms${sufijo}.`);
      await logSincronizacionRepository.registrarEjecucion({
        tipo: 'transacciones_central',
        estado: 'exito',
        detalle: `${lote.length} transacción(es) enviadas.${sufijo}`,
        registrosProcesados: lote.length,
        duracionMs,
      });
      resultado = { ok: true, procesados: lote.length };
    }
  } catch (err) {
    centralDatabase.registrarFallo();
    const detalle = describirError(err);
    logger.error('centralSyncWorker', `Error sincronizando transacciones con la central${sufijo}:`, detalle);
    logger.warn(
      'centralSyncWorker',
      'Las transacciones de este lote quedan en estado "pendiente" (sincronizado_central=0) y se reintentarán solas.'
    );
    await logSincronizacionRepository
      .registrarEjecucion({
        tipo: 'transacciones_central',
        estado: 'error',
        detalle: `${detalle}${sufijo}`,
        duracionMs: Date.now() - inicio,
      })
      .catch(() => {}); // si hasta el log local falla, no queremos otra excepción no controlada
    resultado = {
      ok: false,
      error: esErrorDeRed(err) ? 'sin_conexion' : 'error_sincronizacion',
      mensaje: detalle,
    };
  } finally {
    sincronizacionEnCurso = false;
  }

  return resultado;
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
