'use strict';

const { Router } = require('express');
const catalogoController = require('../controllers/catalogo.controller');

const router = Router();

router.get('/categorias', catalogoController.listarCategorias);
router.get('/contenidos', catalogoController.listarContenidos);
router.get('/contenidos/:id', catalogoController.obtenerContenido);
router.get('/contenidos/:id/descargar', catalogoController.descargarContenido);

module.exports = router;
