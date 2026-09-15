'use strict';

const { db } = require('../config/database');
const { sql } = require('kysely');

/**
 * Lista contenidos activos del catálogo con filtros opcionales.
 * @param {{categoriaId?: number, tipo?: string, busqueda?: string, soloPremium?: boolean, limite?: number, offset?: number}} filtros
 */
async function listarContenidos(filtros = {}) {
  let query = db.selectFrom('contenidos').selectAll().where('estado', '=', 'activo');

  if (filtros.categoriaId) {
    query = query.where('categoria_id', '=', filtros.categoriaId);
  }
  if (filtros.tipo) {
    query = query.where('tipo', '=', filtros.tipo);
  }
  if (typeof filtros.soloPremium === 'boolean') {
    query = query.where('es_premium', '=', filtros.soloPremium ? 1 : 0);
  }
  if (filtros.busqueda) {
    const like = `%${filtros.busqueda.toLowerCase()}%`;
    query = query.where((eb) =>
      eb.or([
        eb(sql`lower(titulo)`, 'like', like),
        eb(sql`lower(descripcion)`, 'like', like),
        eb(sql`lower(etiquetas)`, 'like', like),
      ])
    );
  }

  query = query.orderBy('fecha_agregado', 'desc');

  if (filtros.limite) query = query.limit(filtros.limite);
  if (filtros.offset) query = query.offset(filtros.offset);

  return query.execute();
}

async function contarContenidos(filtros = {}) {
  let query = db
    .selectFrom('contenidos')
    .select(({ fn }) => fn.countAll().as('total'))
    .where('estado', '=', 'activo');

  if (filtros.categoriaId) query = query.where('categoria_id', '=', filtros.categoriaId);
  if (filtros.tipo) query = query.where('tipo', '=', filtros.tipo);

  const fila = await query.executeTakeFirst();
  return Number(fila?.total ?? 0);
}

async function obtenerContenidoPorId(id) {
  return db.selectFrom('contenidos').selectAll().where('id', '=', id).executeTakeFirst();
}

async function obtenerContenidoPorHash(hash) {
  return db.selectFrom('contenidos').selectAll().where('archivo_hash', '=', hash).executeTakeFirst();
}

async function obtenerContenidoPorFuenteUrl(fuenteUrl) {
  return db.selectFrom('contenidos').selectAll().where('fuente_url', '=', fuenteUrl).executeTakeFirst();
}

async function crearContenido(datos) {
  const resultado = await db
    .insertInto('contenidos')
    .values({
      categoria_id: datos.categoriaId ?? null,
      titulo: datos.titulo,
      descripcion: datos.descripcion ?? null,
      autor: datos.autor ?? null,
      tipo: datos.tipo,
      etiquetas: datos.etiquetas ?? null,
      archivo_path: datos.archivoPath ?? null,
      archivo_hash: datos.archivoHash ?? null,
      tamano_bytes: datos.tamanoBytes ?? 0,
      fuente_url: datos.fuenteUrl ?? null,
      fuente_proveedor: datos.fuenteProveedor ?? null,
      es_premium: datos.esPremium ? 1 : 0,
      estado: 'activo',
    })
    .executeTakeFirst();

  return Number(resultado.insertId);
}

async function registrarConsulta(id) {
  await db
    .updateTable('contenidos')
    .set((eb) => ({
      veces_consultado: eb('veces_consultado', '+', 1),
      fecha_ultima_consulta: new Date().toISOString(),
    }))
    .where('id', '=', id)
    .execute();
}

async function registrarDescarga(id) {
  await db
    .updateTable('contenidos')
    .set((eb) => ({ veces_descargado: eb('veces_descargado', '+', 1) }))
    .where('id', '=', id)
    .execute();
}

/**
 * Candidatos a eliminación cíclica de caché: contenidos activos ordenados
 * por menor prioridad, menor demanda (descargas) y más antigua última
 * consulta primero. Usado por el gestor de caché del sync worker.
 */
async function listarCandidatosRotacionCache(limite = 50) {
  return db
    .selectFrom('contenidos')
    .selectAll()
    .where('estado', '=', 'activo')
    .where('fuente_proveedor', '!=', 'manual')
    .orderBy('prioridad_cache', 'asc')
    .orderBy('veces_descargado', 'asc')
    .orderBy('fecha_ultima_consulta', 'asc')
    .limit(limite)
    .execute();
}

async function marcarComoEliminado(id) {
  await db.updateTable('contenidos').set({ estado: 'eliminado', archivo_path: null }).where('id', '=', id).execute();
}

async function sumarTamanoTotalBytes() {
  const fila = await db
    .selectFrom('contenidos')
    .select(({ fn }) => fn.sum('tamano_bytes').as('total'))
    .where('estado', '=', 'activo')
    .executeTakeFirst();
  return Number(fila?.total ?? 0);
}

module.exports = {
  listarContenidos,
  contarContenidos,
  obtenerContenidoPorId,
  obtenerContenidoPorHash,
  obtenerContenidoPorFuenteUrl,
  crearContenido,
  registrarConsulta,
  registrarDescarga,
  listarCandidatosRotacionCache,
  marcarComoEliminado,
  sumarTamanoTotalBytes,
};
