'use strict';

const path = require('node:path');
require('dotenv').config();

/**
 * Configuración centralizada del nodo, leída desde variables de entorno.
 * Todo el resto del código debe importar este módulo en vez de leer
 * process.env directamente, para tener un único punto de verdad.
 */
const env = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',

  NODO_ID: process.env.NODO_ID || 'nodo-dev',
  NODO_NOMBRE: process.env.NODO_NOMBRE || 'Nodo Comunitario (sin nombre)',
  NODO_UBICACION: process.env.NODO_UBICACION || 'Ubicación no configurada',

  DB_PATH: path.resolve(process.cwd(), process.env.DB_PATH || './data/nodo-local.sqlite3'),

  DOWNLOADS_PATH: path.resolve(process.cwd(), process.env.DOWNLOADS_PATH || './data/downloads'),
  DISCO_LIMITE_MB: Number(process.env.DISCO_LIMITE_MB || 8192),
  DISCO_UMBRAL_LIMPIEZA_PCT: Number(process.env.DISCO_UMBRAL_LIMPIEZA_PCT || 85),

  SYNC_CRON_EXPRESION: process.env.SYNC_CRON_EXPRESION || '0 2 * * *',
  SYNC_FUENTE_GUTENDEX_URL: process.env.SYNC_FUENTE_GUTENDEX_URL || 'https://gutendex.com/books',
  SYNC_MAX_DESCARGAS_POR_CICLO: Number(process.env.SYNC_MAX_DESCARGAS_POR_CICLO || 15),
  SYNC_HABILITADO: String(process.env.SYNC_HABILITADO || 'true') === 'true',

  PIN_LONGITUD: Number(process.env.PIN_LONGITUD || 6),
  PIN_COMISION_LOCAL_PCT: Number(process.env.PIN_COMISION_LOCAL_PCT || 20),
  PIN_VALOR_DEFECTO_COP: Number(process.env.PIN_VALOR_DEFECTO_COP || 2000),

  ADMIN_API_KEY: process.env.ADMIN_API_KEY || 'cambia-esta-clave-en-produccion',

  TELEMETRY_HABILITADO: String(process.env.TELEMETRY_HABILITADO || 'false') === 'true',
  TELEMETRY_ENDPOINT_URL: process.env.TELEMETRY_ENDPOINT_URL || '',
  TELEMETRY_INTERVALO_MIN: Number(process.env.TELEMETRY_INTERVALO_MIN || 15),
};

module.exports = env;
