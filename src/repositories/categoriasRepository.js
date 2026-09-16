'use strict';

const { db } = require('../config/database');

async function listarCategorias() {
  return db.selectFrom('categorias').selectAll().orderBy('orden', 'asc').execute();
}

async function obtenerCategoriaPorSlug(slug) {
  return db.selectFrom('categorias').selectAll().where('slug', '=', slug).executeTakeFirst();
}

async function obtenerCategoriaPorId(id) {
  return db.selectFrom('categorias').selectAll().where('id', '=', id).executeTakeFirst();
}

async function crearCategoria(datos) {
  const resultado = await db
    .insertInto('categorias')
    .values({
      nombre: datos.nombre,
      slug: datos.slug,
      descripcion: datos.descripcion ?? null,
      icono: datos.icono ?? 'folder',
      orden: datos.orden ?? 0,
    })
    .executeTakeFirst();
  return Number(resultado.insertId);
}

/** Solo toca las columnas presentes (distintas de `undefined`) en `cambios`. */
async function actualizarCategoria(id, cambios) {
  const set = {};
  if (cambios.nombre !== undefined) set.nombre = cambios.nombre;
  if (cambios.slug !== undefined) set.slug = cambios.slug;
  if (cambios.descripcion !== undefined) set.descripcion = cambios.descripcion;
  if (cambios.icono !== undefined) set.icono = cambios.icono;
  if (cambios.orden !== undefined) set.orden = cambios.orden;

  if (Object.keys(set).length === 0) return;
  await db.updateTable('categorias').set(set).where('id', '=', id).execute();
}

/**
 * Hard delete. Es seguro: `contenidos.categoria_id` tiene
 * `ON DELETE SET NULL` (ver schema.sql), así que los contenidos de esta
 * categoría no se borran ni se bloquean — solo quedan sin categoría
 * asignada.
 */
async function eliminarCategoria(id) {
  await db.deleteFrom('categorias').where('id', '=', id).execute();
}

module.exports = {
  listarCategorias,
  obtenerCategoriaPorSlug,
  obtenerCategoriaPorId,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
};
