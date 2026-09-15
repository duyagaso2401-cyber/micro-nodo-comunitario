'use strict';

/**
 * Tokens de descarga de corta duración, firmados con HMAC-SHA256.
 * Se emiten al validar un PIN y habilitan, por unos minutos, la descarga
 * directa de UN contenido específico sin necesidad de guardar sesión en
 * el servidor (útil en un portal cautivo con muchos clientes distintos).
 *
 * Formato del token: base64url("<contenidoId>.<expiraEnMs>") + "." + firma
 */

const crypto = require('node:crypto');
const env = require('../config/env');

const SECRETO = env.ADMIN_API_KEY;
const TTL_DEFECTO_SEGUNDOS = 300; // 5 minutos

function firmar(payload) {
  return crypto.createHmac('sha256', SECRETO).update(payload).digest('base64url');
}

function generarToken(contenidoId, ttlSegundos = TTL_DEFECTO_SEGUNDOS) {
  const expiraEn = Date.now() + ttlSegundos * 1000;
  const payload = `${contenidoId}.${expiraEn}`;
  const payloadCodificado = Buffer.from(payload, 'utf8').toString('base64url');
  const firma = firmar(payloadCodificado);
  return `${payloadCodificado}.${firma}`;
}

/**
 * @returns {{valido: boolean, contenidoId?: number, motivo?: string}}
 */
function verificarToken(token, contenidoIdEsperado) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valido: false, motivo: 'token_ausente_o_invalido' };
  }

  const [payloadCodificado, firmaRecibida] = token.split('.');
  const firmaEsperada = firmar(payloadCodificado);

  const buffersIguales =
    firmaRecibida &&
    firmaEsperada.length === firmaRecibida.length &&
    crypto.timingSafeEqual(Buffer.from(firmaEsperada), Buffer.from(firmaRecibida));

  if (!buffersIguales) {
    return { valido: false, motivo: 'firma_invalida' };
  }

  const [contenidoIdStr, expiraEnStr] = Buffer.from(payloadCodificado, 'base64url').toString('utf8').split('.');
  const contenidoId = Number(contenidoIdStr);
  const expiraEn = Number(expiraEnStr);

  if (Date.now() > expiraEn) {
    return { valido: false, motivo: 'token_expirado' };
  }
  if (Number(contenidoIdEsperado) !== contenidoId) {
    return { valido: false, motivo: 'token_no_corresponde_al_contenido' };
  }

  return { valido: true, contenidoId };
}

module.exports = { generarToken, verificarToken };
