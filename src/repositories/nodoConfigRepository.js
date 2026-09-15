'use strict';

const { db } = require('../config/database');

async function obtenerValor(clave, valorPorDefecto = null) {
  const fila = await db.selectFrom('nodo_config').selectAll().where('clave', '=', clave).executeTakeFirst();
  return fila ? fila.valor : valorPorDefecto;
}

async function establecerValor(clave, valor) {
  await db
    .insertInto('nodo_config')
    .values({ clave, valor: String(valor), actualizado_en: new Date().toISOString() })
    .onConflict((oc) => oc.column('clave').doUpdateSet({ valor: String(valor), actualizado_en: new Date().toISOString() }))
    .execute();
}

async function obtenerTodaLaConfig() {
  const filas = await db.selectFrom('nodo_config').selectAll().execute();
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

module.exports = { obtenerValor, establecerValor, obtenerTodaLaConfig };
