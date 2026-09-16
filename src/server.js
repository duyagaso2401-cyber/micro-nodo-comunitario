'use strict';

const express = require('express');
const session = require('express-session');
const path = require('node:path');

const env = require('./config/env');
const logger = require('./utils/logger');
require('./config/database'); // asegura carpetas de datos y abre la conexión

const catalogoRoutes = require('./routes/catalogo.routes');
const pinRoutes = require('./routes/pin.routes');
const nodoRoutes = require('./routes/nodo.routes');
const adminRoutes = require('./routes/admin.routes');
const anunciosRoutes = require('./routes/anuncios.routes');
const { manejadorNoEncontrado, manejadorErrores } = require('./middlewares/errorHandler');
const syncWorker = require('./workers/syncWorker');
const centralSyncWorker = require('./workers/centralSyncWorker');
const telemetryService = require('./services/telemetryService');
const { cerrarConexionCentral } = require('./config/centralDatabase');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Necesario cuando el nodo corre detrás de un proxy que termina TLS
// (Render, Railway, nginx con certificado): sin esto, Express nunca ve la
// conexión como "segura" y una cookie con secure:true jamás se enviaría.
if (env.COOKIE_SEGURA) {
  app.set('trust proxy', 1);
}

// Sesión del panel /admin. MemoryStore (el valor por defecto de
// express-session) es intencional aquí: el nodo corre como un único
// proceso Node (en el propio Mini PC/RPi, o como un único servicio en
// Render/Railway), no como un clúster con varias instancias detrás de un
// balanceador, así que no hace falta un store externo (Redis, etc.) —
// perderla implica solo volver a loguearse.
app.use(
  session({
    name: 'nodo_admin_sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // COOKIE_SEGURA=false (por defecto): el portal se sirve por HTTP
      // plano en la red Wi-Fi local del nodo, sin certificado, así que la
      // cookie no puede exigir HTTPS. COOKIE_SEGURA=true: para cuando el
      // nodo se sirve detrás de un proxy con TLS (ver env.js).
      secure: env.COOKIE_SEGURA,
      maxAge: env.SESSION_MAX_EDAD_HORAS * 60 * 60 * 1000,
    },
  })
);

// Portal cautivo / catálogo / panel admin (frontend estático, incluye /admin y /uploads)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Atajos sin extensión ".html" para el panel de administración.
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'login.html')));

// API
// catalogoRoutes ya define internamente /categorias, /contenidos, /contenidos/:id
// y /contenidos/:id/descargar, así que se monta directo bajo /api.
app.use('/api', catalogoRoutes);
app.use('/api/pins', pinRoutes);
app.use('/api/nodo', nodoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/anuncios', anunciosRoutes);

app.get('/api/salud', (req, res) => res.json({ ok: true, servicio: 'micro-nodo-comunitario', version: '0.2.0' }));

app.use('/api', manejadorNoEncontrado);
app.use(manejadorErrores);

app.listen(env.PORT, () => {
  logger.info('server', `Nodo "${env.NODO_NOMBRE}" (${env.NODO_ID}) escuchando en http://0.0.0.0:${env.PORT}`);
  logger.info('server', `Entorno: ${env.NODE_ENV}`);
  syncWorker.iniciarProgramador();
  centralSyncWorker.iniciarProgramador();
  telemetryService.iniciarProgramador();
});

async function apagar(señal) {
  logger.info('server', `Apagando nodo (${señal})...`);
  await cerrarConexionCentral().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
