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

module.exports = { listarCategorias, obtenerCategoriaPorSlug, obtenerCategoriaPorId };
