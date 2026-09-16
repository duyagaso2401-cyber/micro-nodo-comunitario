'use strict';

/**
 * Conexión al backend central (Neon PostgreSQL / Supabase), usada por:
 *   - src/workers/centralSyncWorker.js (sincronización de transacciones)
 *   - src/services/telemetryService.js (heartbeat)
 *
 * Es completamente opcional: si CENTRAL_DATABASE_URL no está configurada,
 * `obtenerDb()` devuelve `null` y todo el código que la usa debe comprobar
 * `estaDisponible()` primero y omitir su trabajo en silencio (registrando
 * un aviso una sola vez). Un nodo debe poder operar 100% offline sin que
 * la ausencia de la central rompa nada del negocio local.
 *
 * A diferencia de la versión inicial de Fase 2, este módulo NO construye
 * el pool una sola vez al cargarse: `obtenerDb()` relee `CENTRAL_DATABASE_URL`
 * directamente de `process.env` en cada llamada (nunca desde `env.js`, que
 * quedó fijado al arrancar el proceso) y reconstruye el pool cuando:
 *   1. La cadena de conexión cambió desde la última vez (se configuró,
 *      se vació, o se actualizó con credenciales nuevas), o
 *   2. Hubo varios fallos consecutivos usando el pool actual — quien
 *      sincroniza (centralSyncWorker, telemetryService) debe avisar con
 *      `registrarFallo()`/`registrarExito()` tras cada intento, así este
 *      módulo puede detectar un pool "zombie" (por ejemplo tras una caída
 *      larga del enlace 4G/IoT de respaldo) y descartarlo en vez de seguir
 *      reintentando sobre una conexión rota indefinidamente.
 */

const { Kysely, PostgresDialect } = require('kysely');
const { Pool } = require('pg');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars -- referenciado solo para el generic de Kysely (JSDoc)
const centralTypes = require('../db/centralTypes');

const UMBRAL_FALLOS_RECONEXION = 3;

let db = null;
let pool = null;
let cadenaActual = null; // cadena de conexión con la que se construyó el pool actual (null = sin pool)
let fallosConsecutivos = 0;
let avisoSinCentralMostrado = false;

function construirPool(cadena) {
  const nuevoPool = new Pool({
    connectionString: cadena,
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
    // Neon/Supabase exigen TLS; no validar la CA del pool contra una lista
    // local evita errores comunes de despliegue en Fase 2. Si tu proveedor
    // exige verificación estricta, ajusta esto con su CA correspondiente.
    ssl: { rejectUnauthorized: false },
  });

  // Sin este listener, un error de red en una conexión inactiva del pool
  // tumba el proceso completo de Node con un 'uncaughtException'. Aquí
  // solo se registra; la reconexión real ocurre en obtenerDb() la próxima
  // vez que alguien la pida, vía el contador de fallos consecutivos.
  nuevoPool.on('error', (err) => {
    logger.error('centralDatabase', 'Error inesperado en el pool de PostgreSQL central:', err.message);
  });

  return nuevoPool;
}

/**
 * Devuelve el cliente Kysely de la central, reconstruyendo el pool cuando
 * hace falta. Se debe llamar SIEMPRE en el momento de usarla (nunca cachear
 * el resultado en un `require` de nivel de módulo) para que los cambios en
 * `CENTRAL_DATABASE_URL` (o una racha de fallos) se reflejen sin reiniciar
 * el proceso.
 */
function obtenerDb() {
  const cadenaEnEnv = process.env.CENTRAL_DATABASE_URL || '';

  if (!cadenaEnEnv) {
    if (pool) {
      logger.warn('centralDatabase', 'CENTRAL_DATABASE_URL se vació: cerrando la conexión central existente.');
      const poolAnterior = pool;
      pool = null;
      db = null;
      poolAnterior.end().catch((err) => {
        logger.warn('centralDatabase', 'Error cerrando el pool anterior de PostgreSQL central (se ignora):', err.message);
      });
    }
    cadenaActual = null;
    fallosConsecutivos = 0;

    if (!avisoSinCentralMostrado) {
      logger.warn(
        'centralDatabase',
        'CENTRAL_DATABASE_URL no está definida: el nodo operará sin backend central (sync de transacciones y telemetría deshabilitados).'
      );
      avisoSinCentralMostrado = true;
    }
    return null;
  }

  avisoSinCentralMostrado = false; // por si se configuró después de arrancar

  const cambioDeCadena = cadenaEnEnv !== cadenaActual;
  const demasiadosFallos = pool !== null && fallosConsecutivos >= UMBRAL_FALLOS_RECONEXION;

  if (cambioDeCadena || demasiadosFallos) {
    if (pool) {
      logger.warn(
        'centralDatabase',
        cambioDeCadena
          ? 'CENTRAL_DATABASE_URL cambió: reconstruyendo la conexión central.'
          : `${fallosConsecutivos} fallos consecutivos con la conexión central actual: reconstruyéndola por si quedó en un estado inválido.`
      );
      const poolAnterior = pool;
      // Cierre en segundo plano: no bloqueamos a quien pide el cliente
      // nuevo esperando a que termine de cerrarse el pool viejo.
      poolAnterior.end().catch((err) => {
        logger.warn('centralDatabase', 'Error cerrando el pool anterior de PostgreSQL central (se ignora):', err.message);
      });
    }

    pool = construirPool(cadenaEnEnv);
    db = new Kysely({ dialect: new PostgresDialect({ pool }) });
    cadenaActual = cadenaEnEnv;
    fallosConsecutivos = 0;
    logger.info('centralDatabase', 'Cliente PostgreSQL central (re)configurado.');
  }

  return db;
}

function estaDisponible() {
  return obtenerDb() !== null;
}

/** Debe llamarse tras cada operación exitosa contra la central (sync o heartbeat). */
function registrarExito() {
  fallosConsecutivos = 0;
}

/** Debe llamarse tras cada operación fallida contra la central (sync o heartbeat). */
function registrarFallo() {
  fallosConsecutivos += 1;
}

async function cerrarConexionCentral() {
  if (pool) await pool.end().catch(() => {});
  pool = null;
  db = null;
  cadenaActual = null;
}

module.exports = { obtenerDb, estaDisponible, registrarExito, registrarFallo, cerrarConexionCentral };
