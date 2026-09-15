'use strict';

const pinService = require('../services/pinService');
const pinsRepository = require('../repositories/pinsRepository');

const MOTIVOS_HTTP = {
  datos_incompletos: 400,
  pin_no_encontrado: 404,
  pin_ya_usado: 409,
  pin_anulado: 409,
  pin_expirado: 409,
  pin_no_valido_para_este_contenido: 403,
  contenido_no_encontrado: 404,
};

async function generarPins(req, res, next) {
  try {
    const { cantidad, valorCop, comisionLocalPct, contenidoId, creadoPor, metodoGeneracion, fechaExpiracion } =
      req.body || {};

    const generados = await pinService.crearLotePins({
      cantidad,
      valorCop,
      comisionLocalPct,
      contenidoId,
      creadoPor,
      metodoGeneracion,
      fechaExpiracion,
    });

    res.status(201).json({ ok: true, pins: generados });
  } catch (err) {
    next(err);
  }
}

async function validarPin(req, res, next) {
  try {
    const { codigo, contenidoId } = req.body || {};
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const resultado = await pinService.validarYConsumirPin({ codigo, contenidoId, ip: String(ip) });

    if (!resultado.ok) {
      const status = MOTIVOS_HTTP[resultado.motivo] || 400;
      return res.status(status).json(resultado);
    }

    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function consultarEstadoPin(req, res, next) {
  try {
    const pin = await pinsRepository.obtenerPinPorCodigo(String(req.params.codigo).toUpperCase());
    if (!pin) return res.status(404).json({ ok: false, error: 'pin_no_encontrado' });

    res.json({
      ok: true,
      pin: {
        codigo: pin.codigo,
        estado: pin.estado,
        valorCop: pin.valor_cop,
        contenidoId: pin.contenido_id,
        fechaCreacion: pin.fecha_creacion,
        fechaUso: pin.fecha_uso,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { generarPins, validarPin, consultarEstadoPin };
