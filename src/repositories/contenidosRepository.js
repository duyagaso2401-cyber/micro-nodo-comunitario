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

// --------------------------------------------------------------------------
// Panel /admin — a diferencia de listarContenidos()/contarContenidos()
// (catálogo público, siempre estado='activo'), estas dos NO filtran por
// estado por defecto: el admin necesita ver también los contenidos
// "Inactivo" (estado='pendiente', ver actualizarContenido()) para poder
// reactivarlos. Sí se excluyen por defecto los que quedaron
// estado='eliminado' por rotación automática de caché (marcarComoEliminado,
// usada por diskManager.js) — son historial interno sin archivo físico, no
// recursos que el admin pueda seguir gestionando; se pueden ver igual
// pasando filtros.estado='eliminado' explícitamente.
// --------------------------------------------------------------------------

/**
 * Igual que listarContenidos() pero con LEFT JOIN a `categorias` (para
 * mostrar/editar la categoría por nombre y slug directamente desde la
 * fila, sin que el frontend tenga que cruzarlo aparte) y sin el filtro fijo
 * de estado='activo'.
 * @param {{categoriaId?: number, tipo?: string, estado?: string, busqueda?: string, limite?: number, offset?: number}} filtros
 */
async function listarContenidosAdmin(filtros = {}) {
  let query = db
    .selectFrom('contenidos')
    .leftJoin('categorias', 'categorias.id', 'contenidos.categoria_id')
    .select([
      'contenidos.id as id',
      'contenidos.categoria_id as categoria_id',
      'contenidos.titulo as titulo',
      'contenidos.descripcion as descripcion',
      'contenidos.autor as autor',
      'contenidos.tipo as tipo',
      'contenidos.etiquetas as etiquetas',
      'contenidos.archivo_path as archivo_path',
      'contenidos.archivo_hash as archivo_hash',
      'contenidos.tamano_bytes as tamano_bytes',
      'contenidos.fuente_url as fuente_url',
      'contenidos.fuente_proveedor as fuente_proveedor',
      'contenidos.es_premium as es_premium',
      'contenidos.estado as estado',
      'contenidos.veces_consultado as veces_consultado',
      'contenidos.veces_descargado as veces_descargado',
      'contenidos.prioridad_cache as prioridad_cache',
      'contenidos.fecha_agregado as fecha_agregado',
      'contenidos.fecha_ultima_consulta as fecha_ultima_consulta',
      'categorias.nombre as categoria_nombre',
      'categorias.slug as categoria_slug',
    ]);

  query = filtros.estado
    ? query.where('contenidos.estado', '=', filtros.estado)
    : query.where('contenidos.estado', '!=', 'eliminado');

  if (filtros.categoriaId) query = query.where('contenidos.categoria_id', '=', filtros.categoriaId);
  if (filtros.tipo) query = query.where('contenidos.tipo', '=', filtros.tipo);
  if (filtros.busqueda) {
    const like = `%${filtros.busqueda.toLowerCase()}%`;
    query = query.where((eb) =>
      eb.or([eb(sql`lower(contenidos.titulo)`, 'like', like), eb(sql`lower(contenidos.descripcion)`, 'like', like)])
    );
  }

  query = query.orderBy('contenidos.fecha_agregado', 'desc');
  if (filtros.limite) query = query.limit(filtros.limite);
  if (filtros.offset) query = query.offset(filtros.offset);

  return query.execute();
}

async function contarContenidosAdmin(filtros = {}) {
  let query = db.selectFrom('contenidos').select(({ fn }) => fn.countAll().as('total'));

  query = filtros.estado ? query.where('estado', '=', filtros.estado) : query.where('estado', '!=', 'eliminado');
  if (filtros.categoriaId) query = query.where('categoria_id', '=', filtros.categoriaId);
  if (filtros.tipo) query = query.where('tipo', '=', filtros.tipo);
  if (filtros.busqueda) {
    const like = `%${filtros.busqueda.toLowerCase()}%`;
    query = query.where((eb) =>
      eb.or([eb(sql`lower(titulo)`, 'like', like), eb(sql`lower(descripcion)`, 'like', like)])
    );
  }

  const fila = await query.executeTakeFirst();
  return Number(fila?.total ?? 0);
}

/**
 * Actualiza campos editables de un contenido desde el panel /admin. Solo
 * toca las columnas cuya clave está presente en `cambios` con valor
 * distinto de `undefined` — así el mismo formulario de edición puede
 * enviar solo lo que cambió (por ejemplo, sin reemplazar el archivo).
 * `cambios.categoriaId = null` SÍ se aplica (quita la categoría); lo que se
 * ignora es `undefined` (campo no enviado).
 */
async function actualizarContenido(id, cambios) {
  const set = {};
  if (cambios.titulo !== undefined) set.titulo = cambios.titulo;
  if (cambios.descripcion !== undefined) set.descripcion = cambios.descripcion;
  if (cambios.autor !== undefined) set.autor = cambios.autor;
  if (cambios.categoriaId !== undefined) set.categoria_id = cambios.categoriaId;
  if (cambios.etiquetas !== undefined) set.etiquetas = cambios.etiquetas;
  if (cambios.estado !== undefined) set.estado = cambios.estado;
  if (cambios.esPremium !== undefined) set.es_premium = cambios.esPremium ? 1 : 0;
  if (cambios.archivoPath !== undefined) set.archivo_path = cambios.archivoPath;
  if (cambios.archivoHash !== undefined) set.archivo_hash = cambios.archivoHash;
  if (cambios.tamanoBytes !== undefined) set.tamano_bytes = cambios.tamanoBytes;

  if (Object.keys(set).length === 0) return;
  await db.updateTable('contenidos').set(set).where('id', '=', id).execute();
}

/**
 * Eliminación DEFINITIVA (hard delete) del registro en `contenidos`. El
 * archivo físico en disco NO se borra aquí — lo hace el controlador
 * (admin.controller.js), que además valida antes que no existan PINs
 * apuntando a este contenido (ver comentario en eliminarContenido()).
 */
async function eliminarContenidoDefinitivo(id) {
  await db.deleteFrom('contenidos').where('id', '=', id).execute();
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
  listarContenidosAdmin,
  contarContenidosAdmin,
  actualizarContenido,
  eliminarContenidoDefinitivo,
};
