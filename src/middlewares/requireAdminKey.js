'use strict';

const env = require('../config/env');

/**
 * Middleware simple para proteger endpoints administrativos (Fase 1).
 * Requiere el header "x-admin-key" con el valor de ADMIN_API_KEY.
 *
 * NOTA: esto es un candado mínimo para el MVP. En Fase 2 se recomienda
 * reemplazarlo por autenticación real (JWT/sesión) para el panel del
 * administrador del nodo.
 */
function requireAdminKey(req, res, next) {
  const clave = req.header('x-admin-key');
  if (!clave || clave !== env.ADMIN_API_KEY) {
    return res.status(401).json({ ok: false, error: 'no_autorizado', mensaje: 'Header x-admin-key inválido o ausente.' });
  }
  next();
}

module.exports = requireAdminKey;
