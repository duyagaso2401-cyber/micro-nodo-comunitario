'use strict';

/**
 * Hashing de contraseñas del panel de administración con `bcryptjs`
 * (implementación 100% JavaScript, sin addon nativo — misma razón por la
 * que la Fase 1 terminó usando `node:sqlite` en vez de `better-sqlite3`:
 * evitar depender de compilar C++ con node-gyp, especialmente en Windows).
 */

const bcrypt = require('bcryptjs');

const RONDAS_SAL = 10;

function hashPassword(passwordPlano) {
  return bcrypt.hashSync(passwordPlano, RONDAS_SAL);
}

function verificarPassword(passwordPlano, hash) {
  return bcrypt.compareSync(passwordPlano, hash);
}

module.exports = { hashPassword, verificarPassword };
