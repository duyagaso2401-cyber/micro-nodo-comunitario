'use strict';

const env = require('../config/env');
const anunciosRepository = require('../repositories/anunciosRepository');

/** GET /api/anuncios/siguiente — un anuncio activo con cupo, o null si no hay ninguno configurado. */
async function siguienteAnuncio(req, res, next) {
  try {
    const disponibles = await anunciosRepository.listarActivosConCupo();
    if (disponibles.length === 0) {
      return res.json({ ok: true, anuncio: null, duracionSegundos: env.ANUNCIO_DURACION_SEGUNDOS });
    }

    const elegido = disponibles[Math.floor(Math.random() * disponibles.length)];
    res.json({
      ok: true,
      anuncio: {
        id: elegido.id,
        titulo: elegido.titulo,
        imagenUrl: elegido.imagen_url,
        link: elegido.link,
      },
      duracionSegundos: env.ANUNCIO_DURACION_SEGUNDOS,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/anuncios/:id/impresion — se llama cuando la cuenta regresiva del anuncio termina. */
async function registrarImpresion(req, res, next) {
  try {
    const id = Number(req.params.id);
    const anuncio = await anunciosRepository.obtenerPorId(id);
    if (!anuncio) return res.status(404).json({ ok: false, error: 'anuncio_no_encontrado' });

    await anunciosRepository.incrementarImpresion(id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { siguienteAnuncio, registrarImpresion };
