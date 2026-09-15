'use strict';

const express = require('express');
const path = require('node:path');

const env = require('./config/env');
const logger = require('./utils/logger');
require('./config/database'); // asegura carpetas de datos y abre la conexión

const catalogoRoutes = require('./routes/catalogo.routes');
const pinRoutes = require('./routes/pin.routes');
const nodoRoutes = require('./routes/nodo.routes');
const { manejadorNoEncontrado, manejadorErrores } = require('./middlewares/errorHandler');
const syncWorker = require('./workers/syncWorker');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Portal cautivo / catálogo (frontend estático)
app.use(express.static(path.join(__dirname, '..', 'public')));

// API
// catalogoRoutes ya define internamente /categorias, /contenidos, /contenidos/:id
// y /contenidos/:id/descargar, así que se monta directo bajo /api.
app.use('/api', catalogoRoutes);
app.use('/api/pins', pinRoutes);
app.use('/api/nodo', nodoRoutes);

app.get('/api/salud', (req, res) => res.json({ ok: true, servicio: 'micro-nodo-comunitario', version: '0.1.0' }));

app.use('/api', manejadorNoEncontrado);
app.use(manejadorErrores);

app.listen(env.PORT, () => {
  logger.info('server', `Nodo "${env.NODO_NOMBRE}" (${env.NODO_ID}) escuchando en http://0.0.0.0:${env.PORT}`);
  logger.info('server', `Entorno: ${env.NODE_ENV}`);
  syncWorker.iniciarProgramador();
});

process.on('SIGINT', () => {
  logger.info('server', 'Apagando nodo (SIGINT)...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('server', 'Apagando nodo (SIGTERM)...');
  process.exit(0);
});
