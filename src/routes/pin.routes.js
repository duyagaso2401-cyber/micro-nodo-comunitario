'use strict';

const { Router } = require('express');
const pinController = require('../controllers/pin.controller');
const requireAdminKey = require('../middlewares/requireAdminKey');

const router = Router();

// Público: el cliente conectado al portal cautivo valida su PIN aquí.
router.post('/validar', pinController.validarPin);

// Administrativo: el operador del nodo (o un futuro panel) genera PINs.
router.post('/generar', requireAdminKey, pinController.generarPins);
router.get('/estado/:codigo', requireAdminKey, pinController.consultarEstadoPin);

module.exports = router;
