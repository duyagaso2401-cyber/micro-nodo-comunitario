'use strict';

const { db } = require('../config/database');

async function registrarEvento(contenidoId, esPremium) {
  await db
    .insertInto('registro_descargas')
    .values({ contenido_id: contenidoId, es_premium: esPremium ? 1 : 0 })
    .execute();
}

async function contarDesde(fechaISODesde) {
  const fila = await db
    .selectFrom('registro_descargas')
    .select(({ fn }) => fn.countAll().as('total'))
    .where('creado_en', '>=', fechaISODesde)
    .executeTakeFirst();
  return Number(fila?.total ?? 0);
}

module.exports = { registrarEvento, contarDesde };
