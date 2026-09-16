'use strict';

/**
 * Configuración de `multer` para las dos subidas de archivos del panel de
 * administración: contenido manual (PDF/EPUB/MP3/video/doc) y las
 * imágenes de los anuncios locales. Guarda en disco directamente (no en
 * memoria), apropiado para el hardware de bajos recursos donde corre el
 * nodo.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const env = require('../config/env');

const CARPETA_CONTENIDO_MANUAL = path.join(env.DOWNLOADS_PATH, 'manual');
fs.mkdirSync(CARPETA_CONTENIDO_MANUAL, { recursive: true });
fs.mkdirSync(env.UPLOADS_ANUNCIOS_PATH, { recursive: true });

function nombreArchivoSeguro(nombreOriginal) {
  const ext = path.extname(nombreOriginal).toLowerCase();
  const sufijo = crypto.randomBytes(6).toString('hex');
  return `${Date.now()}-${sufijo}${ext}`;
}

const EXTENSIONES_CONTENIDO_PERMITIDAS = new Set(['.pdf', '.epub', '.mp3', '.mp4', '.doc', '.docx', '.txt']);
const EXTENSIONES_IMAGEN_PERMITIDAS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const uploadContenidoManual = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CARPETA_CONTENIDO_MANUAL),
    filename: (req, file, cb) => cb(null, nombreArchivoSeguro(file.originalname)),
  }),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB: suficiente para video comprimido/EPUB pesado
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONES_CONTENIDO_PERMITIDAS.has(ext)) {
      return cb(new Error(`Extensión de archivo no permitida: "${ext}".`));
    }
    cb(null, true);
  },
}).single('archivo');

const uploadImagenAnuncio = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, env.UPLOADS_ANUNCIOS_PATH),
    filename: (req, file, cb) => cb(null, nombreArchivoSeguro(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB: es un banner, no un video
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!EXTENSIONES_IMAGEN_PERMITIDAS.has(ext)) {
      return cb(new Error(`Extensión de imagen no permitida: "${ext}".`));
    }
    cb(null, true);
  },
}).single('imagen');

/** Envuelve un middleware de multer (que usa callbacks) para reportar errores como JSON en vez de crashear. */
function conManejoDeErrores(middlewareMulter) {
  return (req, res, next) => {
    middlewareMulter(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, error: 'error_de_subida', mensaje: err.message });
      next();
    });
  };
}

module.exports = {
  uploadContenidoManual: conManejoDeErrores(uploadContenidoManual),
  uploadImagenAnuncio: conManejoDeErrores(uploadImagenAnuncio),
  CARPETA_CONTENIDO_MANUAL,
};
