'use strict';

const logger = require('../utils/logger');

function manejadorNoEncontrado(req, res) {
  res.status(404).json({ ok: false, error: 'recurso_no_encontrado', ruta: req.originalUrl });
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  logger.error('http', `${req.method} ${req.originalUrl} ->`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: status === 500 ? 'error_interno' : err.code || 'error',
    mensaje: err.message,
  });
}

module.exports = { manejadorNoEncontrado, manejadorErrores };
