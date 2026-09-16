'use strict';

const { db } = require('../config/database');

async function registrarTransaccion(datos) {
  const resultado = await db
    .insertInto('transacciones')
    .values({
      tipo: datos.tipo,
      pin_id: datos.pinId ?? null,
      contenido_id: datos.contenidoId ?? null,
      monto_cop: datos.montoCop ?? 0,
      comision_cop: datos.comisionCop ?? 0,
      metodo_pago: datos.metodoPago ?? 'efectivo',
      cliente_ref: datos.clienteRef ?? null,
    })
    .executeTakeFirst();

  return Number(resultado.insertId);
}

async function resumenDelDia(fechaISODesde) {
  return db
    .selectFrom('transacciones')
    .select(({ fn }) => [
      fn.count('id').as('total_transacciones'),
      fn.sum('monto_cop').as('monto_total_cop'),
      fn.sum('comision_cop').as('comision_total_cop'),
    ])
    .where('estado', '=', 'confirmada')
    .where('creado_en', '>=', fechaISODesde)
    .executeTakeFirst();
}

async function listarUltimasTransacciones(limite = 20) {
  return db
    .selectFrom('transacciones')
    .selectAll()
    .orderBy('creado_en', 'desc')
    .limit(limite)
    .execute();
}

/**
 * Estadísticas del día para el heartbeat y el panel de administración.
 * `pinesConsumidosHoy` asume que cada transacción tipo 'descarga_premium'
 * corresponde a exactamente un PIN consumido (así es como pinService.js
 * las registra).
 */
async function estadisticasDelDia(fechaISODesde) {
  const [totales, pines] = await Promise.all([
    db
      .selectFrom('transacciones')
      .select(({ fn }) => [
        fn.count('id').as('total_transacciones'),
        fn.sum('monto_cop').as('monto_total_cop'),
        fn.sum('comision_cop').as('comision_total_cop'),
      ])
      .where('estado', '=', 'confirmada')
      .where('creado_en', '>=', fechaISODesde)
      .executeTakeFirst(),
    db
      .selectFrom('transacciones')
      .select(({ fn }) => fn.count('id').as('total'))
      .where('estado', '=', 'confirmada')
      .where('tipo', '=', 'descarga_premium')
      .where('creado_en', '>=', fechaISODesde)
      .executeTakeFirst(),
  ]);

  return {
    totalTransacciones: Number(totales?.total_transacciones ?? 0),
    montoTotalCop: Number(totales?.monto_total_cop ?? 0),
    comisionTotalCop: Number(totales?.comision_total_cop ?? 0),
    pinesConsumidosHoy: Number(pines?.total ?? 0),
  };
}

/** Transacciones aún no enviadas a la central (para el batch del sync worker). */
async function listarNoSincronizadasConCentral(limite = 50) {
  return db
    .selectFrom('transacciones')
    .selectAll()
    .where('sincronizado_central', '=', 0)
    .orderBy('id', 'asc')
    .limit(limite)
    .execute();
}

async function marcarSincronizadasConCentral(ids) {
  if (ids.length === 0) return;
  await db
    .updateTable('transacciones')
    .set({ sincronizado_central: 1, fecha_sincronizado_central: new Date().toISOString() })
    .where('id', 'in', ids)
    .execute();
}

module.exports = {
  registrarTransaccion,
  resumenDelDia,
  listarUltimasTransacciones,
  estadisticasDelDia,
  listarNoSincronizadasConCentral,
  marcarSincronizadasConCentral,
};
