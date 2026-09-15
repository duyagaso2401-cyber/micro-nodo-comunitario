'use strict';

/**
 * Fuente de contenido: Gutendex (https://gutendex.com), una API pública y
 * gratuita sobre el catálogo de Project Gutenberg (libros de dominio
 * público). No requiere API key. Se usa para poblar la categoría
 * "Biblioteca Digital" en Fase 1.
 *
 * Documentación: https://gutendex.com/
 */

const env = require('../../config/env');
const logger = require('../../utils/logger');

// Orden de preferencia de formatos de descarga (mime type -> tipo interno)
const FORMATOS_PREFERIDOS = [
  { mime: 'application/epub+zip', tipo: 'epub', ext: 'epub' },
  { mime: 'application/pdf', tipo: 'pdf', ext: 'pdf' },
  { mime: 'text/plain; charset=utf-8', tipo: 'doc', ext: 'txt' },
  { mime: 'text/plain', tipo: 'doc', ext: 'txt' },
];

function elegirFormatoDescarga(formats) {
  for (const candidato of FORMATOS_PREFERIDOS) {
    const url = formats[candidato.mime];
    if (url) return { url, tipo: candidato.tipo, ext: candidato.ext };
  }
  return null;
}

function limpiarDescripcion(libro) {
  const autores = (libro.authors || []).map((a) => a.name).join(', ') || 'Autor desconocido';
  const materias = (libro.subjects || []).slice(0, 3).join(', ');
  return `Obra de dominio público (Project Gutenberg). Autor(es): ${autores}.${
    materias ? ` Temas: ${materias}.` : ''
  }`;
}

/**
 * Consulta Gutendex y devuelve una lista normalizada de recursos
 * descargables, lista para pasar a syncWorker.
 * @param {{cantidad?: number, idioma?: string}} opciones
 */
async function obtenerLibrosPublicos({ cantidad = 15, idioma = 'es' } = {}) {
  const url = new URL(env.SYNC_FUENTE_GUTENDEX_URL);
  url.searchParams.set('languages', idioma);
  url.searchParams.set('sort', 'popular');

  logger.info('gutendexSource', `Consultando catálogo público: ${url.toString()}`);

  const respuesta = await fetch(url, {
    headers: { 'User-Agent': 'micro-nodo-comunitario/0.1 (offline-first community node)' },
  });

  if (!respuesta.ok) {
    throw new Error(`Gutendex respondió con estado ${respuesta.status}`);
  }

  const datos = await respuesta.json();
  const libros = Array.isArray(datos.results) ? datos.results : [];

  const recursos = [];
  for (const libro of libros) {
    if (recursos.length >= cantidad) break;

    const formato = elegirFormatoDescarga(libro.formats || {});
    if (!formato) continue; // sin formato descargable útil, se omite

    recursos.push({
      titulo: libro.title || 'Sin título',
      autor: (libro.authors || []).map((a) => a.name).join(', ') || null,
      descripcion: limpiarDescripcion(libro),
      tipo: formato.tipo,
      extension: formato.ext,
      urlArchivo: formato.url,
      fuenteUrl: formato.url,
      fuenteProveedor: 'gutendex',
      etiquetas: (libro.subjects || []).slice(0, 5).join(','),
    });
  }

  logger.info('gutendexSource', `${recursos.length} recursos candidatos obtenidos de ${libros.length} resultados.`);
  return recursos;
}

module.exports = { obtenerLibrosPublicos };
