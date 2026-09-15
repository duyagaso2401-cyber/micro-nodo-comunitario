'use strict';

const { db } = require('../config/database');

async function crearPin(datos) {
  const resultado = await db
    .insertInto('pins_acceso')
    .values({
      codigo: datos.codigo,
      contenido_id: datos.contenidoId ?? null,
      valor_cop: datos.valorCop,
      comision_local_pct: datos.comisionLocalPct,
      creado_por: datos.creadoPor ?? null,
      metodo_generacion: datos.metodoGeneracion ?? 'manual',
      fecha_expiracion: datos.fechaExpiracion ?? null,
    })
    .executeTakeFirst();

  return Number(resultado.insertId);
}

async function obtenerPinPorCodigo(codigo) {
  return db.selectFrom('pins_acceso').selectAll().where('codigo', '=', codigo).executeTakeFirst();
}

async function marcarPinUsado(id, usadoPorIp) {
  await db
    .updateTable('pins_acceso')
    .set({
      estado: 'usado',
      fecha_uso: new Date().toISOString(),
      usado_por_ip: usadoPorIp ?? null,
    })
    .where('id', '=', id)
    .where('estado', '=', 'disponible')
    .execute();
}

async function listarPinsDisponibles(limite = 100) {
  return db
    .selectFrom('pins_acceso')
    .selectAll()
    .where('estado', '=', 'disponible')
    .orderBy('fecha_creacion', 'desc')
    .limit(limite)
    .execute();
}

module.exports = { crearPin, obtenerPinPorCodigo, marcarPinUsado, listarPinsDisponibles };
