'use strict';

const { db } = require('../config/database');

/**
 * @param {{tipo: 'contenido'|'transacciones_central'|'heartbeat', estado: 'exito'|'error'|'omitido', detalle?: string, registrosProcesados?: number, duracionMs?: number}} datos
 */
async function registrarEjecucion(datos) {
  await db
    .insertInto('log_sincronizacion')
    .values({
      tipo: datos.tipo,
      estado: datos.estado,
      detalle: datos.detalle ?? null,
      registros_procesados: datos.registrosProcesados ?? 0,
      duracion_ms: datos.duracionMs ?? null,
    })
    .execute();
}

async function listarUltimasEjecuciones(limite = 50, tipo) {
  let query = db.selectFrom('log_sincronizacion').selectAll().orderBy('creado_en', 'desc').limit(limite);
  if (tipo) query = query.where('tipo', '=', tipo);
  return query.execute();
}

module.exports = { registrarEjecucion, listarUltimasEjecuciones };
