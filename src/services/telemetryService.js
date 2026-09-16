'use strict';

/**
 * Canal de telemetría / heartbeat (Fase 2). Cada TELEMETRY_INTERVALO_MIN
 * minutos (5 por defecto) arma un JSON liviano con el estado del nodo y
 * lo escribe en la tabla `heartbeats` de la base de datos central
 * (Neon/Supabase), reutilizando el mismo cliente Postgres que usa
 * centralSyncWorker.js.
 *
 * Nota de diseño: el enunciado original habla de "WebSocket o llamadas
 * HTTP heartbeat a un backend de administración central". Como Fase 2 ya
 * monta una conexión directa a Postgres central para sincronizar
 * transacciones, la telemetría reutiliza esa misma conexión en vez de
 * levantar un servicio HTTP central aparte — es la opción más simple que
 * cumple el mismo objetivo (que la central sepa cómo está cada nodo). Si
 * más adelante se construye un backend de administración con su propia
 * API HTTP/WebSocket, esta función es el único lugar que habría que
 * cambiar (hoy hace un INSERT; ahí haría un fetch()/socket.emit()).
 */

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const centralDatabase = require('../config/centralDatabase');
const centralRepository = require('../repositories/centralRepository');
const diskManager = require('../workers/diskManager');
const contenidosRepository = require('../repositories/contenidosRepository');
const transaccionesRepository = require('../repositories/transaccionesRepository');
const registroDescargasRepository = require('../repositories/registroDescargasRepository');
const logSincronizacionRepository = require('../repositories/logSincronizacionRepository');
const { inicioDeHoyUTC } = require('../utils/fechas');

let enviandoHeartbeat = false;

/** Arma el payload de telemetría del nodo. Reutilizable también por el panel /admin. */
async function recolectarEstado() {
  const inicioHoy = inicioDeHoyUTC();

  const [discoUsadoMB, contenidosActivos, estadisticasHoy, descargasHoy] = await Promise.all([
    diskManager.calcularEspacioUsadoMB(),
    contenidosRepository.contarContenidos({}),
    transaccionesRepository.estadisticasDelDia(inicioHoy),
    registroDescargasRepository.contarDesde(inicioHoy),
  ]);

  return {
    nodoId: env.NODO_ID,
    discoUsadoMB,
    discoLimiteMB: env.DISCO_LIMITE_MB,
    uptimeSegundos: process.uptime(),
    descargasHoy,
    pinsConsumidosHoy: estadisticasHoy.pinesConsumidosHoy,
    recaudadoHoyCop: estadisticasHoy.montoTotalCop,
    contenidosActivos,
  };
}

/**
 * @param {{esCorridaInicial?: boolean}} [opciones] `esCorridaInicial: true`
 *   solo cambia el texto de los logs (para distinguir en la tabla
 *   `log_sincronizacion` el heartbeat de prueba del arranque de los
 *   heartbeats periódicos normales).
 */
async function enviarHeartbeat({ esCorridaInicial = false } = {}) {
  // estaDisponible() relee CENTRAL_DATABASE_URL en caliente en cada
  // llamada (ver config/centralDatabase.js), así que un cambio en la
  // variable de entorno se refleja aquí sin reiniciar el proceso.
  if (!env.TELEMETRY_HABILITADO || !centralDatabase.estaDisponible()) return;
  if (enviandoHeartbeat) return;

  enviandoHeartbeat = true;
  const inicio = Date.now();
  const sufijoCorrida = esCorridaInicial ? ' (corrida inicial de arranque)' : '';

  try {
    const estado = await recolectarEstado();
    await centralRepository.upsertNodo();
    await centralRepository.insertarHeartbeat(estado);

    centralDatabase.registrarExito();

    logger.info(
      'telemetryService',
      `Heartbeat enviado${sufijoCorrida}: disco ${Math.round(estado.discoUsadoMB)}MB, ${estado.contenidosActivos} contenidos, ` +
        `${estado.descargasHoy} descargas hoy, ${estado.pinsConsumidosHoy} PINs hoy, $${estado.recaudadoHoyCop} COP hoy.`
    );
    await logSincronizacionRepository.registrarEjecucion({
      tipo: 'heartbeat',
      estado: 'exito',
      detalle: `Heartbeat enviado a la central.${sufijoCorrida}`,
      registrosProcesados: 1,
      duracionMs: Date.now() - inicio,
    });
  } catch (err) {
    centralDatabase.registrarFallo();
    logger.error('telemetryService', `Error enviando heartbeat${sufijoCorrida}:`, err.message);
    await logSincronizacionRepository
      .registrarEjecucion({
        tipo: 'heartbeat',
        estado: 'error',
        detalle: `${err.message}${sufijoCorrida}`,
        duracionMs: Date.now() - inicio,
      })
      .catch(() => {});
  } finally {
    enviandoHeartbeat = false;
  }
}

function iniciarProgramador() {
  if (!env.TELEMETRY_HABILITADO) {
    logger.info('telemetryService', 'Telemetría deshabilitada (TELEMETRY_HABILITADO=false).');
    return null;
  }

  // node-cron no tiene una sintaxis nativa de "cada N minutos" arbitraria
  // más allá de */N sobre el campo de minutos, así que se arma aquí y se
  // limita a un rango sensato (1-59) para que la expresión sea válida.
  const minutos = Math.min(59, Math.max(1, env.TELEMETRY_INTERVALO_MIN));
  const expresionCron = `*/${minutos} * * * *`;

  if (!cron.validate(expresionCron)) {
    logger.error('telemetryService', `Expresión cron de telemetría inválida: "${expresionCron}".`);
    return null;
  }

  // Igual que centralSyncWorker: un primer heartbeat inmediato al
  // arrancar (fire-and-forget) para detectar configuración inválida de la
  // central desde el arranque, sin esperar al primer disparo del cron.
  enviarHeartbeat({ esCorridaInicial: true }).catch((err) =>
    logger.error('telemetryService', 'Fallo no controlado en el heartbeat inicial:', err)
  );

  const tarea = cron.schedule(expresionCron, () => {
    enviarHeartbeat().catch((err) => logger.error('telemetryService', 'Fallo no controlado:', err));
  });

  logger.info('telemetryService', `Programador de telemetría iniciado (cada ${minutos} min).`);
  return tarea;
}

module.exports = { recolectarEstado, enviarHeartbeat, iniciarProgramador };
