'use strict';

/**
 * Gestión de disco / caché cíclica del nodo:
 * - Calcula el uso actual de almacenamiento de contenidos indexados.
 * - Cuando se supera el umbral configurado, elimina automáticamente los
 *   contenidos de menor prioridad/demanda (los menos descargados y menos
 *   consultados recientemente) hasta volver a un nivel seguro.
 *
 * Los contenidos con fuente_proveedor = 'manual' (subidos a mano por el
 * operador del nodo) nunca se tocan aquí: la rotación automática solo
 * afecta contenido sincronizado automáticamente.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const env = require('../config/env');
const logger = require('../utils/logger');
const contenidosRepository = require('../repositories/contenidosRepository');

const BYTES_POR_MB = 1024 * 1024;

async function calcularEspacioUsadoMB() {
  const totalBytes = await contenidosRepository.sumarTamanoTotalBytes();
  return totalBytes / BYTES_POR_MB;
}

async function debeLiberarEspacio() {
  const usadoMB = await calcularEspacioUsadoMB();
  const umbralMB = (env.DISCO_LIMITE_MB * env.DISCO_UMBRAL_LIMPIEZA_PCT) / 100;
  return { requiere: usadoMB >= umbralMB, usadoMB, umbralMB, limiteMB: env.DISCO_LIMITE_MB };
}

async function eliminarArchivoDeDisco(archivoPath) {
  if (!archivoPath) return;
  const rutaAbsoluta = path.join(env.DOWNLOADS_PATH, archivoPath);
  try {
    await fs.unlink(rutaAbsoluta);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('diskManager', `No se pudo eliminar ${rutaAbsoluta}:`, err.message);
    }
  }
}

/**
 * Libera espacio en disco eliminando contenido de baja demanda/prioridad
 * hasta quedar por debajo del umbral configurado, o hasta agotar
 * candidatos elegibles.
 */
async function liberarEspacioSiNecesario() {
  let estado = await debeLiberarEspacio();
  if (!estado.requiere) {
    logger.info(
      'diskManager',
      `Uso de disco OK: ${estado.usadoMB.toFixed(1)}MB / ${estado.limiteMB}MB (umbral ${estado.umbralMB.toFixed(1)}MB).`
    );
    return { eliminados: 0, usadoMB: estado.usadoMB };
  }

  logger.warn(
    'diskManager',
    `Umbral de disco superado (${estado.usadoMB.toFixed(1)}MB >= ${estado.umbralMB.toFixed(1)}MB). Iniciando rotación de caché...`
  );

  let eliminados = 0;
  let intentosSinCandidatos = 0;

  while (estado.requiere && intentosSinCandidatos < 3) {
    const candidatos = await contenidosRepository.listarCandidatosRotacionCache(20);
    if (candidatos.length === 0) {
      intentosSinCandidatos += 1;
      break;
    }

    for (const candidato of candidatos) {
      await eliminarArchivoDeDisco(candidato.archivo_path);
      await contenidosRepository.marcarComoEliminado(candidato.id);
      eliminados += 1;
      logger.info('diskManager', `Contenido rotado fuera de caché: "${candidato.titulo}" (id=${candidato.id}).`);

      estado = await debeLiberarEspacio();
      if (!estado.requiere) break;
    }
  }

  logger.info(
    'diskManager',
    `Rotación de caché finalizada. ${eliminados} contenido(s) eliminado(s). Uso actual: ${estado.usadoMB.toFixed(1)}MB.`
  );

  return { eliminados, usadoMB: estado.usadoMB };
}

module.exports = { calcularEspacioUsadoMB, debeLiberarEspacio, liberarEspacioSiNecesario };
