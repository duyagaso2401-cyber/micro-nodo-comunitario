'use strict';

const { Router } = require('express');
const nodoController = require('../controllers/nodo.controller');

const router = Router();

router.get('/estado', nodoController.estado);

module.exports = router;
