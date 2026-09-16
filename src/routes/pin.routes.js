'use strict';

const { Router } = require('express');
const pinController = require('../controllers/pin.controller');
const requireAdminAuth = require('../middlewares/requireAdminAuth');

const router = Router();

// Público: el cliente conectado al portal cautivo valida su PIN aquí.
router.post('/validar', pinController.validarPin);

// Administrativo: el operador del nodo (desde /admin, o vía x-admin-key) genera PINs.
router.post('/generar', requireAdminAuth, pinController.generarPins);
router.get('/estado/:codigo', requireAdminAuth, pinController.consultarEstadoPin);

module.exports = router;
