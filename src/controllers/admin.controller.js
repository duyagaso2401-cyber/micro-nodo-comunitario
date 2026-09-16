'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const env = require('../config/env');
const logger = require('../utils/logger');
const telemetryService = require('../services/telemetryService');
const pinService = require('../services/pinService');
const pinsRepository = require('../repositories/pinsRepository');
const contenidosRepository = require('../repositories/contenidosRepository');
const categoriasRepository = require('../repositories/categoriasRepository');
const anunciosRepository = require('../repositories/anunciosRepository');
const logSincronizacionRepository = require('../repositories/logSincronizacionRepository');
const nodoConfigRepository = require('../repositories/nodoConfigRepository');
const { estaDisponible: centralDisponible } = require('../config/centralDatabase');

const TIPOS_CONTENIDO_VALIDOS = new Set(['pdf', 'epub', 'mp3', 'video', 'doc', 'otro']);

/** GET /api/admin/estadisticas — tarjetas del dashboard. */
async function estadisticas(req, res, next) {
  try {
    const [estado, pinsDisponibles, pinsUsados, ultimaSincContenido] = await Promise.all([
      telemetryService.recolectarEstado(),
      pinsRepository.contarPins({ estado: 'disponible' }),
      pinsRepository.contarPins({ estado: 'usado' }),
      nodoConfigRepository.obtenerValor('sync_ultima_ejecucion', null),
    ]);

    res.json({
      ok: true,
      nodo: { id: env.NODO_ID, nombre: env.NODO_NOMBRE, ubicacion: env.NODO_UBICACION },
      almacenamiento: { usadoMB: Math.round(estado.discoUsadoMB), limiteMB: estado.discoLimiteMB },
      hoy: {
        descargas: estado.descargasHoy,
        pinsConsumidos: estado.pinsConsumidosHoy,
        recaudadoCop: estado.recaudadoHoyCop,
      },
      pines: { disponibles: pinsDisponibles, usados: pinsUsados },
      contenidosActivos: estado.contenidosActivos,
      central: { conectada: centralDisponible() },
      sincronizacionContenido: { ultimaEjecucion: ultimaSincContenido },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/pins?estado=&page=&pageSize= */
async function listarPins(req, res, next) {
  try {
    const { estado } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

    const filtros = { estado, limite: pageSize, offset: (page - 1) * pageSize };
    const [pins, total] = await Promise.all([pinsRepository.listarPins(filtros), pinsRepository.contarPins(filtros)]);

    res.json({ ok: true, pins, total, page, pageSize });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/pins/generar — igual que /api/pins/generar, expuesto también bajo el namespace admin. */
async function generarPins(req, res, next) {
  try {
    const generados = await pinService.crearLotePins({ ...req.body, creadoPor: req.session?.admin?.usuario });
    res.status(201).json({ ok: true, pins: generados });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/sincronizacion?tipo=&limite= */
async function listarSincronizacion(req, res, next) {
  try {
    const limite = Math.min(200, Math.max(1, Number(req.query.limite) || 50));
    const registros = await logSincronizacionRepository.listarUltimasEjecuciones(limite, req.query.tipo);
    res.json({ ok: true, registros });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/contenidos (multipart/form-data, campo "archivo") — carga manual de emergencia. */
async function subirContenidoManual(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'archivo_requerido' });
    }

    const { titulo, descripcion, autor, tipo, categoriaSlug, esPremium, etiquetas } = req.body;

    if (!titulo || !tipo) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ ok: false, error: 'datos_incompletos', mensaje: 'Faltan "titulo" o "tipo".' });
    }
    if (!TIPOS_CONTENIDO_VALIDOS.has(tipo)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ ok: false, error: 'tipo_invalido' });
    }

    let categoriaId = null;
    if (categoriaSlug) {
      const categoria = await categoriasRepository.obtenerCategoriaPorSlug(categoriaSlug);
      categoriaId = categoria ? categoria.id : null;
    }

    const buffer = await fs.promises.readFile(req.file.path);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    const existente = await contenidosRepository.obtenerContenidoPorHash(hash);
    if (existente) {
      await fs.promises.unlink(req.file.path);
      return res.status(409).json({ ok: false, error: 'contenido_duplicado', contenidoExistenteId: existente.id });
    }

    const rutaRelativa = path.relative(env.DOWNLOADS_PATH, req.file.path);

    const id = await contenidosRepository.crearContenido({
      categoriaId,
      titulo,
      descripcion: descripcion || null,
      autor: autor || null,
      tipo,
      etiquetas: etiquetas || null,
      archivoPath: rutaRelativa,
      archivoHash: hash,
      tamanoBytes: buffer.length,
      fuenteProveedor: 'manual',
      esPremium: esPremium === 'true' || esPremium === true,
    });

    logger.info('admin.controller', `Contenido manual cargado: "${titulo}" (id=${id}) por ${req.session?.admin?.usuario || 'x-admin-key'}.`);
    res.status(201).json({ ok: true, contenidoId: id });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

// --- Anuncios (publicidad local) ---

async function listarAnuncios(req, res, next) {
  try {
    const anuncios = await anunciosRepository.listarTodos();
    res.json({ ok: true, anuncios });
  } catch (err) {
    next(err);
  }
}

async function crearAnuncio(req, res, next) {
  try {
    const { titulo, link, impresionesMax, imagenUrl } = req.body;
    if (!titulo) return res.status(400).json({ ok: false, error: 'titulo_requerido' });

    let imagenFinal = imagenUrl || null;
    if (req.file) {
      imagenFinal = `/uploads/anuncios/${req.file.filename}`;
    }
    if (!imagenFinal) {
      return res.status(400).json({ ok: false, error: 'imagen_requerida', mensaje: 'Sube un archivo o indica imagenUrl.' });
    }

    const id = await anunciosRepository.crearAnuncio({
      titulo,
      imagenUrl: imagenFinal,
      link: link || null,
      impresionesMax: Number(impresionesMax) || 0,
    });

    res.status(201).json({ ok: true, anuncioId: id });
  } catch (err) {
    next(err);
  }
}

async function alternarAnuncio(req, res, next) {
  try {
    const id = Number(req.params.id);
    const anuncio = await anunciosRepository.obtenerPorId(id);
    if (!anuncio) return res.status(404).json({ ok: false, error: 'anuncio_no_encontrado' });

    await anunciosRepository.alternarActivo(id, !anuncio.activo);
    res.json({ ok: true, activo: !anuncio.activo });
  } catch (err) {
    next(err);
  }
}

async function eliminarAnuncio(req, res, next) {
  try {
    await anunciosRepository.eliminarAnuncio(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  estadisticas,
  listarPins,
  generarPins,
  listarSincronizacion,
  subirContenidoManual,
  listarAnuncios,
  crearAnuncio,
  alternarAnuncio,
  eliminarAnuncio,
};
