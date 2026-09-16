'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const env = require('../config/env');
const logger = require('../utils/logger');
const telemetryService = require('../services/telemetryService');
const centralSyncWorker = require('../workers/centralSyncWorker');
const pinService = require('../services/pinService');
const pinsRepository = require('../repositories/pinsRepository');
const contenidosRepository = require('../repositories/contenidosRepository');
const categoriasRepository = require('../repositories/categoriasRepository');
const anunciosRepository = require('../repositories/anunciosRepository');
const logSincronizacionRepository = require('../repositories/logSincronizacionRepository');
const nodoConfigRepository = require('../repositories/nodoConfigRepository');
const { estaDisponible: centralDisponible } = require('../config/centralDatabase');

const TIPOS_CONTENIDO_VALIDOS = new Set(['pdf', 'epub', 'mp3', 'video', 'doc', 'otro']);
const ESTADOS_CONTENIDO_EDITABLES = new Set(['activo', 'pendiente']); // "pendiente" = "Inactivo" en el panel (ver actualizarContenido())

/** "Manuales de Agricultura" -> "manuales-de-agricultura" (sin tildes, minúsculas, solo [a-z0-9-]). */
function slugify(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

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

/**
 * POST /api/admin/sincronizacion/ahora — botón "Sincronizar ahora" del
 * panel: fuerza un intento inmediato de envío de las transacciones
 * pendientes a la central, sin esperar al próximo disparo del cron. Si
 * falla (por ejemplo sin internet: ENOTFOUND/ETIMEDOUT/ECONNREFUSED), las
 * transacciones de ese lote quedan igual que estaban (sincronizado_central=0
 * en la base local) — centralSyncWorker.sincronizarAhora() solo las marca
 * como sincronizadas después de que la central confirmó recibirlas, nunca
 * antes ni "por las dudas". Siempre responde 200 con `{ok: true/false, ...}`
 * (nunca 500 por un fallo de red hacia la central), para que el panel
 * pueda mostrar el resultado sin tratarlo como un error del propio nodo.
 */
async function sincronizarCentralAhora(req, res, next) {
  try {
    const resultado = await centralSyncWorker.sincronizarAhora({ esManual: true });
    res.json(resultado);
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

/** GET /api/admin/contenidos?estado=&tipo=&busqueda=&page=&pageSize= — listado completo (incluye "Inactivo") para el panel. */
async function listarContenidosAdmin(req, res, next) {
  try {
    const { estado, tipo, busqueda } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));

    const filtros = { estado, tipo, busqueda, limite: pageSize, offset: (page - 1) * pageSize };
    const [contenidos, total] = await Promise.all([
      contenidosRepository.listarContenidosAdmin(filtros),
      contenidosRepository.contarContenidosAdmin(filtros),
    ]);

    res.json({ ok: true, contenidos, total, page, pageSize });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/contenidos/:id (multipart/form-data, campo "archivo"
 * OPCIONAL — solo se envía si se quiere reemplazar el archivo). Permite
 * modificar título, categoría, estado (Activo/Inactivo) y demás metadatos,
 * y opcionalmente reemplazar el archivo subido.
 */
async function editarContenido(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existente = await contenidosRepository.obtenerContenidoPorId(id);
    if (!existente) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ ok: false, error: 'contenido_no_encontrado' });
    }

    const { titulo, descripcion, autor, categoriaSlug, etiquetas, estado, esPremium } = req.body;

    if (estado !== undefined && !ESTADOS_CONTENIDO_EDITABLES.has(estado)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res
        .status(400)
        .json({ ok: false, error: 'estado_invalido', mensaje: 'Usa "activo" o "pendiente" (Inactivo).' });
    }

    // categoriaId se deja `undefined` (no tocar) si categoriaSlug no vino en
    // el body; se pone en `null` explícitamente si vino vacío (quitar
    // categoría); si vino con un slug, se resuelve al id correspondiente.
    let categoriaId;
    if (categoriaSlug !== undefined) {
      if (categoriaSlug === '') {
        categoriaId = null;
      } else {
        const categoria = await categoriasRepository.obtenerCategoriaPorSlug(categoriaSlug);
        if (!categoria) {
          if (req.file) fs.unlink(req.file.path, () => {});
          return res.status(400).json({ ok: false, error: 'categoria_invalida' });
        }
        categoriaId = categoria.id;
      }
    }

    const cambios = {
      titulo,
      descripcion,
      autor,
      categoriaId,
      etiquetas,
      estado,
      esPremium: esPremium !== undefined ? esPremium === 'true' || esPremium === true : undefined,
    };

    let rutaArchivoAnterior = null;
    if (req.file) {
      const buffer = await fs.promises.readFile(req.file.path);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      const duplicado = await contenidosRepository.obtenerContenidoPorHash(hash);
      if (duplicado && duplicado.id !== id) {
        await fs.promises.unlink(req.file.path);
        return res.status(409).json({ ok: false, error: 'contenido_duplicado', contenidoExistenteId: duplicado.id });
      }

      cambios.archivoPath = path.relative(env.DOWNLOADS_PATH, req.file.path);
      cambios.archivoHash = hash;
      cambios.tamanoBytes = buffer.length;
      rutaArchivoAnterior = existente.archivo_path ? path.join(env.DOWNLOADS_PATH, existente.archivo_path) : null;
    }

    await contenidosRepository.actualizarContenido(id, cambios);

    // El archivo viejo se borra DESPUÉS de confirmar el UPDATE, para no
    // quedarnos sin ningún archivo si algo falla a mitad de camino.
    if (rutaArchivoAnterior) {
      fs.unlink(rutaArchivoAnterior, (err) => {
        if (err && err.code !== 'ENOENT') {
          logger.warn('admin.controller', `No se pudo borrar el archivo anterior "${rutaArchivoAnterior}":`, err.message);
        }
      });
    }

    logger.info('admin.controller', `Contenido id=${id} editado por ${req.session?.admin?.usuario || 'x-admin-key'}.`);
    res.json({ ok: true });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

/**
 * DELETE /api/admin/contenidos/:id — borra el registro de la base de datos
 * Y el archivo físico asociado. Bloqueado (409) si hay PINs apuntando a
 * este contenido: ver el comentario en pinsRepository.contarPinsPorContenido().
 */
async function eliminarContenido(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existente = await contenidosRepository.obtenerContenidoPorId(id);
    if (!existente) return res.status(404).json({ ok: false, error: 'contenido_no_encontrado' });

    const pinsAsociados = await pinsRepository.contarPinsPorContenido(id);
    if (pinsAsociados > 0) {
      return res.status(409).json({
        ok: false,
        error: 'contenido_con_pines_asociados',
        mensaje: `No se puede eliminar: hay ${pinsAsociados} PIN(s) asociados a este contenido. Reasígnalos o anúlalos primero.`,
        pinsAsociados,
      });
    }

    await contenidosRepository.eliminarContenidoDefinitivo(id);

    if (existente.archivo_path) {
      const rutaCompleta = path.join(env.DOWNLOADS_PATH, existente.archivo_path);
      fs.unlink(rutaCompleta, (err) => {
        if (err && err.code !== 'ENOENT') {
          logger.warn('admin.controller', `No se pudo borrar el archivo "${rutaCompleta}":`, err.message);
        }
      });
    }

    logger.info(
      'admin.controller',
      `Contenido id=${id} ("${existente.titulo}") eliminado definitivamente por ${req.session?.admin?.usuario || 'x-admin-key'}.`
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// --- Categorías ---

/** GET /api/admin/categorias — listado para el panel (Editar/Eliminar; el catálogo público usa GET /api/categorias). */
async function listarCategoriasAdmin(req, res, next) {
  try {
    const categorias = await categoriasRepository.listarCategorias();
    res.json({ ok: true, categorias });
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/categorias — el slug se deriva automáticamente del nombre. */
async function crearCategoriaAdmin(req, res, next) {
  try {
    const { nombre, descripcion, icono, orden } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, error: 'nombre_requerido' });

    const slug = slugify(nombre);
    if (!slug) return res.status(400).json({ ok: false, error: 'nombre_invalido' });

    const existente = await categoriasRepository.obtenerCategoriaPorSlug(slug);
    if (existente) {
      return res
        .status(409)
        .json({ ok: false, error: 'categoria_duplicada', mensaje: `Ya existe una categoría con el slug "${slug}".` });
    }

    const id = await categoriasRepository.crearCategoria({
      nombre,
      slug,
      descripcion: descripcion || null,
      icono: icono || 'folder',
      orden: Number(orden) || 0,
    });

    res.status(201).json({ ok: true, categoriaId: id, slug });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/categorias/:id */
async function editarCategoriaAdmin(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existente = await categoriasRepository.obtenerCategoriaPorId(id);
    if (!existente) return res.status(404).json({ ok: false, error: 'categoria_no_encontrada' });

    const { nombre, descripcion, icono, orden } = req.body;
    const cambios = {};

    if (nombre !== undefined) {
      const slug = slugify(nombre);
      if (!slug) return res.status(400).json({ ok: false, error: 'nombre_invalido' });

      const conflicto = await categoriasRepository.obtenerCategoriaPorSlug(slug);
      if (conflicto && conflicto.id !== id) {
        return res
          .status(409)
          .json({ ok: false, error: 'categoria_duplicada', mensaje: `Ya existe otra categoría con el slug "${slug}".` });
      }
      cambios.nombre = nombre;
      cambios.slug = slug;
    }
    if (descripcion !== undefined) cambios.descripcion = descripcion;
    if (icono !== undefined) cambios.icono = icono;
    if (orden !== undefined) cambios.orden = Number(orden) || 0;

    await categoriasRepository.actualizarCategoria(id, cambios);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/categorias/:id — los contenidos de la categoría quedan sin categoría (ON DELETE SET NULL), no se borran. */
async function eliminarCategoriaAdmin(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existente = await categoriasRepository.obtenerCategoriaPorId(id);
    if (!existente) return res.status(404).json({ ok: false, error: 'categoria_no_encontrada' });

    await categoriasRepository.eliminarCategoria(id);
    res.json({ ok: true });
  } catch (err) {
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

/** PUT /api/admin/anuncios/:id (multipart/form-data, campo "imagen" OPCIONAL para reemplazar el banner). */
async function editarAnuncio(req, res, next) {
  try {
    const id = Number(req.params.id);
    const existente = await anunciosRepository.obtenerPorId(id);
    if (!existente) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ ok: false, error: 'anuncio_no_encontrado' });
    }

    const { titulo, link, impresionesMax } = req.body;
    const cambios = {};
    if (titulo !== undefined) cambios.titulo = titulo;
    if (link !== undefined) cambios.link = link || null;
    if (impresionesMax !== undefined) cambios.impresionesMax = Number(impresionesMax) || 0;

    let imagenAnteriorPath = null;
    if (req.file) {
      cambios.imagenUrl = `/uploads/anuncios/${req.file.filename}`;
      // Solo se borra la imagen anterior si era un archivo local nuestro
      // (empieza con /uploads/anuncios/); si era una URL externa
      // (imagenUrl manual, ver crearAnuncio), no hay archivo local que borrar.
      if (existente.imagen_url && existente.imagen_url.startsWith('/uploads/anuncios/')) {
        imagenAnteriorPath = path.join(env.UPLOADS_ANUNCIOS_PATH, path.basename(existente.imagen_url));
      }
    }

    await anunciosRepository.actualizarAnuncio(id, cambios);

    if (imagenAnteriorPath) {
      fs.unlink(imagenAnteriorPath, (err) => {
        if (err && err.code !== 'ENOENT') {
          logger.warn('admin.controller', `No se pudo borrar la imagen anterior "${imagenAnteriorPath}":`, err.message);
        }
      });
    }

    res.json({ ok: true });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(err);
  }
}

module.exports = {
  estadisticas,
  listarPins,
  generarPins,
  listarSincronizacion,
  sincronizarCentralAhora,
  subirContenidoManual,
  listarContenidosAdmin,
  editarContenido,
  eliminarContenido,
  listarCategoriasAdmin,
  crearCategoriaAdmin,
  editarCategoriaAdmin,
  eliminarCategoriaAdmin,
  listarAnuncios,
  crearAnuncio,
  alternarAnuncio,
  eliminarAnuncio,
  editarAnuncio,
};
