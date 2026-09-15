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

module.exports = { registrarTransaccion, resumenDelDia, listarUltimasTransacciones };
