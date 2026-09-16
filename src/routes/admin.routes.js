'use strict';

const { Router } = require('express');
const adminAuthController = require('../controllers/adminAuth.controller');
const adminController = require('../controllers/admin.controller');
const requireAdminAuth = require('../middlewares/requireAdminAuth');
const { uploadContenidoManual, uploadImagenAnuncio } = require('../middlewares/uploads');

const router = Router();

// --- Autenticación (públicas: son el propio mecanismo de login) ---
router.post('/login', adminAuthController.login);
router.post('/logout', adminAuthController.logout);
router.get('/me', adminAuthController.me);

// --- A partir de aquí, todo requiere sesión de admin (o x-admin-key) ---
router.use(requireAdminAuth);

router.post('/cambiar-password', adminAuthController.cambiarPassword);

router.get('/estadisticas', adminController.estadisticas);

router.get('/pins', adminController.listarPins);
router.post('/pins/generar', adminController.generarPins);

router.get('/sincronizacion', adminController.listarSincronizacion);
router.post('/sincronizacion/ahora', adminController.sincronizarCentralAhora);

router.get('/contenidos', adminController.listarContenidosAdmin);
router.post('/contenidos', uploadContenidoManual, adminController.subirContenidoManual);
router.put('/contenidos/:id', uploadContenidoManual, adminController.editarContenido);
router.delete('/contenidos/:id', adminController.eliminarContenido);

router.get('/categorias', adminController.listarCategoriasAdmin);
router.post('/categorias', adminController.crearCategoriaAdmin);
router.put('/categorias/:id', adminController.editarCategoriaAdmin);
router.delete('/categorias/:id', adminController.eliminarCategoriaAdmin);

router.get('/anuncios', adminController.listarAnuncios);
router.post('/anuncios', uploadImagenAnuncio, adminController.crearAnuncio);
router.put('/anuncios/:id', uploadImagenAnuncio, adminController.editarAnuncio);
router.patch('/anuncios/:id/alternar', adminController.alternarAnuncio);
router.delete('/anuncios/:id', adminController.eliminarAnuncio);

module.exports = router;
