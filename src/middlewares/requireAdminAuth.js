'use strict';

const env = require('../config/env');

/**
 * Protege endpoints administrativos. Acepta DOS formas de autenticación:
 *
 *   1. Sesión de navegador (req.session.admin) — la que usa el panel
 *      /admin tras iniciar sesión con usuario/contraseña.
 *   2. Header "x-admin-key" — se mantiene por retrocompatibilidad con
 *      integraciones de Fase 1 (scripts, POS, curl de prueba) que ya
 *      usaban ADMIN_API_KEY y no pasan por un navegador con cookies.
 *
 * Reemplaza a la Fase 1 (requireAdminKey.js), que solo soportaba (2).
 */
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  const clave = req.header('x-admin-key');
  if (clave && clave === env.ADMIN_API_KEY) {
    return next();
  }

  return res
    .status(401)
    .json({ ok: false, error: 'no_autorizado', mensaje: 'Inicia sesión en /admin o envía un header x-admin-key válido.' });
}

module.exports = requireAdminAuth;
