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

  // --- Fase 2: backend central (Neon/Supabase Postgres) ---
  CENTRAL_DATABASE_URL: process.env.CENTRAL_DATABASE_URL || '',
  CENTRAL_SYNC_HABILITADO: String(process.env.CENTRAL_SYNC_HABILITADO ?? 'true') === 'true',
  CENTRAL_SYNC_CRON_EXPRESION: process.env.CENTRAL_SYNC_CRON_EXPRESION || '*/10 * * * *',
  CENTRAL_SYNC_LOTE_MAX: Number(process.env.CENTRAL_SYNC_LOTE_MAX || 50),

  // --- Fase 2: telemetría (heartbeat hacia la central) ---
  TELEMETRY_HABILITADO: String(process.env.TELEMETRY_HABILITADO ?? 'true') === 'true',
  TELEMETRY_INTERVALO_MIN: Number(process.env.TELEMETRY_INTERVALO_MIN || 5),

  // --- Fase 2: sesión y bootstrap del administrador del panel /admin ---
  SESSION_SECRET: process.env.SESSION_SECRET || 'cambia-este-secreto-de-sesion-en-produccion',
  SESSION_MAX_EDAD_HORAS: Number(process.env.SESSION_MAX_EDAD_HORAS || 12),
  ADMIN_USUARIO: process.env.ADMIN_USUARIO || 'admin',
  ADMIN_PASSWORD_INICIAL: process.env.ADMIN_PASSWORD_INICIAL || 'cambiar123',
  // true SOLO si el nodo se sirve detrás de un proxy que termina TLS (Render,
  // Railway, nginx con certificado, etc. — la app en sí recibe HTTP plano).
  // Déjala en false para el despliegue típico offline-first: un Mini
  // PC/Raspberry Pi sirviendo el portal por HTTP plano en la red Wi-Fi
  // local, donde exigir HTTPS en la cookie rompería el login del panel.
  COOKIE_SEGURA: String(process.env.COOKIE_SEGURA ?? 'false') === 'true',

  // --- Fase 2: publicidad local / cargas manuales ---
  UPLOADS_ANUNCIOS_PATH: path.resolve(process.cwd(), process.env.UPLOADS_ANUNCIOS_PATH || './public/uploads/anuncios'),
  ANUNCIO_DURACION_SEGUNDOS: Number(process.env.ANUNCIO_DURACION_SEGUNDOS || 5),
};

module.exports = env;
