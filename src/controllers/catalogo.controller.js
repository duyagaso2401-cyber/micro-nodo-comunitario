'use strict';

const path = require('node:path');
const fsSync = require('node:fs');
const env = require('../config/env');
const logger = require('../utils/logger');
const categoriasRepository = require('../repositories/categoriasRepository');
const contenidosRepository = require('../repositories/contenidosRepository');
const descargaToken = require('../utils/descargaToken');

async function listarCategorias(req, res, next) {
  try {
    const categorias = await categoriasRepository.listarCategorias();
    res.json({ ok: true, categorias });
  } catch (err) {
    next(err);
  }
}

async function listarContenidos(req, res, next) {
  try {
    const { categoria, tipo, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));

    let categoriaId;
    if (categoria) {
      const cat = await categoriasRepository.obtenerCategoriaPorSlug(categoria);
      if (!cat) {
        return res.json({ ok: true, contenidos: [], total: 0, page, pageSize });
      }
      categoriaId = cat.id;
    }

    const filtros = { categoriaId, tipo, busqueda: q, limite: pageSize, offset: (page - 1) * pageSize };
    const [contenidos, total] = await Promise.all([
      contenidosRepository.listarContenidos(filtros),
      contenidosRepository.contarContenidos(filtros),
    ]);

    const items = contenidos.map(mapearContenidoPublico);
    res.json({ ok: true, contenidos: items, total, page, pageSize });
  } catch (err) {
    next(err);
  }
}

async function obtenerContenido(req, res, next) {
  try {
    const id = Number(req.params.id);
    const contenido = await contenidosRepository.obtenerContenidoPorId(id);
    if (!contenido || contenido.estado !== 'activo') {
      return res.status(404).json({ ok: false, error: 'contenido_no_encontrado' });
    }
    await contenidosRepository.registrarConsulta(id);
    res.json({ ok: true, contenido: mapearContenidoPublico(contenido) });
  } catch (err) {
    next(err);
  }
}

async function descargarContenido(req, res, next) {
  try {
    const id = Number(req.params.id);
    const contenido = await contenidosRepository.obtenerContenidoPorId(id);

    if (!contenido || contenido.estado !== 'activo' || !contenido.archivo_path) {
      return res.status(404).json({ ok: false, error: 'contenido_no_encontrado' });
    }

    if (contenido.es_premium) {
      const token = req.query.token;
      const verificacion = descargaToken.verificarToken(token, id);
      if (!verificacion.valido) {
        return res.status(402).json({
          ok: false,
          error: 'pago_requerido',
          motivo: verificacion.motivo,
          mensaje: 'Este contenido es premium. Valida un PIN en /api/pins/validar para obtener un enlace de descarga.',
        });
      }
    }

    const rutaAbsoluta = path.join(env.DOWNLOADS_PATH, contenido.archivo_path);
    if (!fsSync.existsSync(rutaAbsoluta)) {
      logger.error('catalogo.controller', `Archivo ausente en disco para contenido ${id}: ${rutaAbsoluta}`);
      return res.status(410).json({ ok: false, error: 'archivo_no_disponible' });
    }

    await contenidosRepository.registrarDescarga(id);

    const nombreDescarga = `${contenido.titulo}.${path.extname(rutaAbsoluta).slice(1) || 'bin'}`;
    res.download(rutaAbsoluta, nombreDescarga);
  } catch (err) {
    next(err);
  }
}

/** Oculta detalles internos (ruta física en disco) de la respuesta pública. */
function mapearContenidoPublico(c) {
  return {
    id: c.id,
    categoriaId: c.categoria_id,
    titulo: c.titulo,
    descripcion: c.descripcion,
    autor: c.autor,
    tipo: c.tipo,
    etiquetas: c.etiquetas ? c.etiquetas.split(',').filter(Boolean) : [],
    tamanoBytes: c.tamano_bytes,
    esPremium: Boolean(c.es_premium),
    vecesConsultado: c.veces_consultado,
    vecesDescargado: c.veces_descargado,
    fechaAgregado: c.fecha_agregado,
  };
}

module.exports = { listarCategorias, listarContenidos, obtenerContenido, descargarContenido };
