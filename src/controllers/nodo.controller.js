'use strict';

const env = require('../config/env');
const diskManager = require('../workers/diskManager');
const contenidosRepository = require('../repositories/contenidosRepository');
const nodoConfigRepository = require('../repositories/nodoConfigRepository');

/**
 * Estado básico del nodo para el encabezado del portal cautivo.
 * Es intencionalmente liviano: la telemetría completa hacia el backend
 * central de administración (Neon/Supabase) queda para Fase 2.
 */
async function estado(req, res, next) {
  try {
    const [espacio, totalContenidos, ultimaSincronizacion] = await Promise.all([
      diskManager.calcularEspacioUsadoMB(),
      contenidosRepository.contarContenidos({}),
      nodoConfigRepository.obtenerValor('sync_ultima_ejecucion', null),
    ]);

    res.json({
      ok: true,
      nodo: {
        id: env.NODO_ID,
        nombre: env.NODO_NOMBRE,
        ubicacion: env.NODO_UBICACION,
      },
      almacenamiento: {
        usadoMB: Math.round(espacio),
        limiteMB: env.DISCO_LIMITE_MB,
      },
      catalogo: {
        totalContenidos,
      },
      sincronizacion: {
        ultimaEjecucion: ultimaSincronizacion,
        habilitada: env.SYNC_HABILITADO,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { estado };
