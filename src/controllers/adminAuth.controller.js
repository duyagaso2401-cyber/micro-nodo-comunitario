'use strict';

const adminsRepository = require('../repositories/adminsRepository');
const authService = require('../services/authService');

async function login(req, res, next) {
  try {
    const { usuario, password } = req.body || {};
    if (!usuario || !password) {
      return res.status(400).json({ ok: false, error: 'datos_incompletos' });
    }

    const admin = await adminsRepository.obtenerPorUsuario(String(usuario).trim());
    if (!admin || !authService.verificarPassword(password, admin.password_hash)) {
      return res.status(401).json({ ok: false, error: 'credenciales_invalidas' });
    }

    req.session.admin = { id: admin.id, usuario: admin.usuario };
    await adminsRepository.actualizarUltimoAcceso(admin.id);

    res.json({ ok: true, admin: { usuario: admin.usuario } });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('nodo_admin_sid');
    res.json({ ok: true });
  });
}

function me(req, res) {
  if (req.session && req.session.admin) {
    return res.json({ ok: true, admin: req.session.admin });
  }
  res.status(401).json({ ok: false, error: 'sin_sesion' });
}

async function cambiarPassword(req, res, next) {
  try {
    const { passwordActual, passwordNueva } = req.body || {};
    if (!passwordActual || !passwordNueva || passwordNueva.length < 6) {
      return res.status(400).json({
        ok: false,
        error: 'datos_incompletos',
        mensaje: 'La nueva contraseña debe tener al menos 6 caracteres.',
      });
    }
    if (!req.session?.admin) {
      return res.status(401).json({ ok: false, error: 'sin_sesion' });
    }

    const admin = await adminsRepository.obtenerPorUsuario(req.session.admin.usuario);
    if (!admin || !authService.verificarPassword(passwordActual, admin.password_hash)) {
      return res.status(401).json({ ok: false, error: 'password_actual_incorrecta' });
    }

    await adminsRepository.cambiarPassword(admin.id, authService.hashPassword(passwordNueva));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me, cambiarPassword };
