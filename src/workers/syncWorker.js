'use strict';

/**
 * Worker de Sincronización Autónoma (Background Sync Worker).
 *
 * Se ejecuta en ventana de bajo tráfico (por defecto 2:00 AM, configurable
 * vía SYNC_CRON_EXPRESION) y:
 *   1. Consulta una fuente pública de contenido educativo (Gutendex).
 *   2. Descarga los archivos nuevos y calcula su hash/metadatos.
 *   3. Indexa cada archivo en SQLite (tabla contenidos).
 *   4. Ejecuta el gestor de caché cíclica para mantener el disco bajo control.
 *
 * Diseñado para poder ejecutarse también manualmente:
 *   npm run sync
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const cron = require('node-cron');

const env = require('../config/env');
const logger = require('../utils/logger');
const contenidosRepository = require('../repositories/contenidosRepository');
const categoriasRepository = require('../repositories/categoriasRepository');
const nodoConfigRepository = require('../repositories/nodoConfigRepository');
const gutendexSource = require('./sources/gutendexSource');
const diskManager = require('./diskManager');

const SLUG_CATEGORIA_DESTINO = 'biblioteca-digital';
const SUBCARPETA_DESCARGAS = 'biblioteca-digital';

let sincronizacionEnCurso = false;

function calcularHashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function nombreArchivoSeguro(titulo) {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase();
}

async function descargarArchivo(url) {
  const respuesta = await fetch(url, {
    headers: { 'User-Agent': 'micro-nodo-comunitario/0.1 (offline-first community node)' },
  });
  if (!respuesta.ok) {
    throw new Error(`Descarga falló con estado ${respuesta.status} para ${url}`);
  }
  const arrayBuffer = await respuesta.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function indexarRecurso(recurso, categoriaId) {
  // Evita volver a descargar algo que ya se indexó desde la misma URL de origen.
  const existente = await contenidosRepository.obtenerContenidoPorFuenteUrl(recurso.fuenteUrl);
  if (existente) {
    logger.info('syncWorker', `Omitido (ya indexado): "${recurso.titulo}"`);
    return { descargado: false };
  }

  let buffer;
  try {
    buffer = await descargarArchivo(recurso.urlArchivo);
  } catch (err) {
    logger.warn('syncWorker', `No se pudo descargar "${recurso.titulo}":`, err.message);
    return { descargado: false };
  }

  const hash = calcularHashBuffer(buffer);
  const duplicado = await contenidosRepository.obtenerContenidoPorHash(hash);
  if (duplicado) {
    logger.info('syncWorker', `Omitido (duplicado por hash): "${recurso.titulo}"`);
    return { descargado: false };
  }

  const carpetaDestino = path.join(env.DOWNLOADS_PATH, SUBCARPETA_DESCARGAS);
  await fs.mkdir(carpetaDestino, { recursive: true });

  const nombreArchivo = `${nombreArchivoSeguro(recurso.titulo)}-${hash.slice(0, 8)}.${recurso.extension}`;
  const rutaAbsoluta = path.join(carpetaDestino, nombreArchivo);
  await fs.writeFile(rutaAbsoluta, buffer);

  const rutaRelativa = path.join(SUBCARPETA_DESCARGAS, nombreArchivo);

  await contenidosRepository.crearContenido({
    categoriaId,
    titulo: recurso.titulo,
    descripcion: recurso.descripcion,
    autor: recurso.autor,
    tipo: recurso.tipo,
    etiquetas: recurso.etiquetas,
    archivoPath: rutaRelativa,
    archivoHash: hash,
    tamanoBytes: buffer.length,
    fuenteUrl: recurso.fuenteUrl,
    fuenteProveedor: recurso.fuenteProveedor,
    esPremium: false, // Fase 1: todo el contenido sincronizado es de libre consulta
  });

  logger.info('syncWorker', `Indexado: "${recurso.titulo}" (${(buffer.length / 1024).toFixed(0)} KB)`);
  return { descargado: true };
}

/**
 * Punto de entrada principal del worker. Idempotente y segura para
 * ejecutar manualmente o desde el cron.
 */
async function ejecutarSincronizacion() {
  if (sincronizacionEnCurso) {
    logger.warn('syncWorker', 'Sincronización ya en curso, se omite esta ejecución.');
    return;
  }
  if (!env.SYNC_HABILITADO) {
    logger.info('syncWorker', 'Sincronización deshabilitada por configuración (SYNC_HABILITADO=false).');
    return;
  }

  sincronizacionEnCurso = true;
  const inicio = Date.now();
  logger.info('syncWorker', '=== Iniciando ciclo de sincronización autónoma ===');

  try {
    const categoria = await categoriasRepository.obtenerCategoriaPorSlug(SLUG_CATEGORIA_DESTINO);
    if (!categoria) {
      throw new Error(
        `Categoría destino "${SLUG_CATEGORIA_DESTINO}" no existe. Ejecuta "npm run db:migrate" primero.`
      );
    }

    const recursos = await gutendexSource.obtenerLibrosPublicos({
      cantidad: env.SYNC_MAX_DESCARGAS_POR_CICLO,
      idioma: 'es',
    });

    let nuevosDescargados = 0;
    for (const recurso of recursos) {
      const resultado = await indexarRecurso(recurso, categoria.id);
      if (resultado.descargado) nuevosDescargados += 1;
    }

    const rotacion = await diskManager.liberarEspacioSiNecesario();

    await nodoConfigRepository.establecerValor('sync_ultima_ejecucion', new Date().toISOString());
    await nodoConfigRepository.establecerValor('sync_ultimo_resultado', JSON.stringify({
      nuevosDescargados,
      candidatosEvaluados: recursos.length,
      eliminadosPorRotacion: rotacion.eliminados,
    }));

    const duracionSeg = ((Date.now() - inicio) / 1000).toFixed(1);
    logger.info(
      'syncWorker',
      `=== Ciclo completado en ${duracionSeg}s. Nuevos: ${nuevosDescargados}/${recursos.length}. Eliminados por rotación: ${rotacion.eliminados}. ===`
    );
  } catch (err) {
    logger.error('syncWorker', 'Error durante la sincronización:', err.message);
  } finally {
    sincronizacionEnCurso = false;
  }
}

/**
 * Registra el job programado (node-cron). Debe llamarse una sola vez al
 * arrancar el servidor.
 */
function iniciarProgramador() {
  if (!env.SYNC_HABILITADO) {
    logger.info('syncWorker', 'Programador de sincronización no iniciado (SYNC_HABILITADO=false).');
    return null;
  }

  if (!cron.validate(env.SYNC_CRON_EXPRESION)) {
    logger.error('syncWorker', `Expresión cron inválida: "${env.SYNC_CRON_EXPRESION}". Programador no iniciado.`);
    return null;
  }

  const tarea = cron.schedule(env.SYNC_CRON_EXPRESION, () => {
    ejecutarSincronizacion().catch((err) => logger.error('syncWorker', 'Fallo no controlado:', err));
  });

  logger.info('syncWorker', `Programador iniciado con expresión cron "${env.SYNC_CRON_EXPRESION}".`);
  return tarea;
}

module.exports = { ejecutarSincronizacion, iniciarProgramador };
