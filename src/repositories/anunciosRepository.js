'use strict';

const { db } = require('../config/database');

async function listarTodos() {
  return db.selectFrom('anuncios').selectAll().orderBy('creado_en', 'desc').execute();
}

/** Anuncios activos que todavía tienen cupo de impresiones (o son ilimitados). */
async function listarActivosConCupo() {
  return db
    .selectFrom('anuncios')
    .selectAll()
    .where('activo', '=', 1)
    .where((eb) => eb.or([eb('impresiones_max', '=', 0), eb('impresiones_actuales', '<', eb.ref('impresiones_max'))]))
    .execute();
}

async function obtenerPorId(id) {
  return db.selectFrom('anuncios').selectAll().where('id', '=', id).executeTakeFirst();
}

async function crearAnuncio(datos) {
  const resultado = await db
    .insertInto('anuncios')
    .values({
      titulo: datos.titulo,
      imagen_url: datos.imagenUrl,
      link: datos.link ?? null,
      impresiones_max: datos.impresionesMax ?? 0,
    })
    .executeTakeFirst();
  return Number(resultado.insertId);
}

async function incrementarImpresion(id) {
  await db
    .updateTable('anuncios')
    .set((eb) => ({ impresiones_actuales: eb('impresiones_actuales', '+', 1) }))
    .where('id', '=', id)
    .execute();
}

async function alternarActivo(id, activo) {
  await db
    .updateTable('anuncios')
    .set({ activo: activo ? 1 : 0 })
    .where('id', '=', id)
    .execute();
}

async function eliminarAnuncio(id) {
  await db.deleteFrom('anuncios').where('id', '=', id).execute();
}

module.exports = {
  listarTodos,
  listarActivosConCupo,
  obtenerPorId,
  crearAnuncio,
  incrementarImpresion,
  alternarActivo,
  eliminarAnuncio,
};
