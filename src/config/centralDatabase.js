'use strict';

/**
 * Conexión al backend central (Neon PostgreSQL / Supabase), usada por:
 *   - src/workers/centralSyncWorker.js (sincronización de transacciones)
 *   - src/services/telemetryService.js (heartbeat)
 *
 * Es completamente opcional: si CENTRAL_DATABASE_URL no está configurada,
 * `db` es `null` y todo el código que la usa debe comprobar
 * `estaDisponible()` primero y omitir su trabajo en silencio (registrando
 * un aviso una sola vez). Un nodo debe poder operar 100% offline sin que
 * la ausencia de la central rompa nada del negocio local.
 */

const { Kysely, PostgresDialect } = require('kysely');
const { Pool } = require('pg');
const env = require('../config/env');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars -- referenciado solo para el generic de Kysely (JSDoc)
const centralTypes = require('../db/centralTypes');

let db = null;
let pool = null;

if (env.CENTRAL_DATABASE_URL) {
  pool = new Pool({
    connectionString: env.CENTRAL_DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000,
    // Neon/Supabase exigen TLS; no validar la CA del pool contra una lista
    // local evita errores comunes de despliegue en Fase 2. Si tu proveedor
    // exige verificación estricta, ajusta esto con su CA correspondiente.
    ssl: { rejectUnauthorized: false },
  });

  // Sin este listener, un error de red en una conexión inactiva del pool
  // (por ejemplo, se cae el enlace 4G/IoT de respaldo) tumba el proceso
  // completo de Node con un 'uncaughtException'. Aquí solo se registra.
  pool.on('error', (err) => {
    logger.error('centralDatabase', 'Error inesperado en el pool de PostgreSQL central:', err.message);
  });

  /** @type {Kysely<import('../db/centralTypes').CentralDatabase>} */
  db = new Kysely({
    dialect: new PostgresDialect({ pool }),
  });

  logger.info('centralDatabase', 'Cliente PostgreSQL central configurado.');
} else {
  logger.warn(
    'centralDatabase',
    'CENTRAL_DATABASE_URL no está definida: el nodo operará sin backend central (sync de transacciones y telemetría deshabilitados).'
  );
}

function estaDisponible() {
  return db !== null;
}

async function cerrarConexionCentral() {
  if (pool) await pool.end();
}

module.exports = { db, estaDisponible, cerrarConexionCentral };
