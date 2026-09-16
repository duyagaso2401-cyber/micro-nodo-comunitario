'use strict';

const { Router } = require('express');
const anunciosController = require('../controllers/anuncios.controller');

const router = Router();

router.get('/siguiente', anunciosController.siguienteAnuncio);
router.post('/:id/impresion', anunciosController.registrarImpresion);

module.exports = router;
