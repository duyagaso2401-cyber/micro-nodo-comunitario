'use strict';

const { db } = require('../config/database');

async function obtenerPorUsuario(usuario) {
  return db.selectFrom('admins').selectAll().where('usuario', '=', usuario).executeTakeFirst();
}

async function actualizarUltimoAcceso(id) {
  await db.updateTable('admins').set({ ultimo_acceso: new Date().toISOString() }).where('id', '=', id).execute();
}

async function cambiarPassword(id, nuevoHash) {
  await db.updateTable('admins').set({ password_hash: nuevoHash }).where('id', '=', id).execute();
}

async function contarAdmins() {
  const fila = await db
    .selectFrom('admins')
    .select(({ fn }) => fn.countAll().as('total'))
    .executeTakeFirst();
  return Number(fila?.total ?? 0);
}

module.exports = { obtenerPorUsuario, actualizarUltimoAcceso, cambiarPassword, contarAdmins };
