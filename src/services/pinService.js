'use strict';

/**
 * Lógica de negocio de monetización por PIN (Fase 1: solo lógica local,
 * sin integración real de pasarela QR — ver ADMIN_API_KEY y sección
 * "Próximos pasos" del README para el punto de extensión de Wompi/Nequi).
 */

const crypto = require('node:crypto');
const env = require('../config/env');
const pinsRepository = require('../repositories/pinsRepository');
const contenidosRepository = require('../repositories/contenidosRepository');
const transaccionesRepository = require('../repositories/transaccionesRepository');
const descargaToken = require('../utils/descargaToken');
const centralSyncWorker = require('../workers/centralSyncWorker');

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para que el operador del
// local pueda dictar o escribir el PIN a mano sin confusiones.
const ALFABETO_PIN = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generarCodigoPin(longitud = env.PIN_LONGITUD) {
  let codigo = '';
  const bytes = crypto.randomBytes(longitud);
  for (let i = 0; i < longitud; i += 1) {
    codigo += ALFABETO_PIN[bytes[i] % ALFABETO_PIN.length];
  }
  return codigo;
}

/**
 * Genera uno o varios PINs nuevos, garantizando códigos únicos.
 * @param {{cantidad?: number, valorCop?: number, comisionLocalPct?: number, contenidoId?: number|null, creadoPor?: string, metodoGeneracion?: 'manual'|'qr'|'lote'}} opciones
 */
async function crearLotePins(opciones = {}) {
  const cantidad = Math.min(200, Math.max(1, Number(opciones.cantidad) || 1));
  const valorCop = Number(opciones.valorCop ?? env.PIN_VALOR_DEFECTO_COP);
  const comisionLocalPct = Number(opciones.comisionLocalPct ?? env.PIN_COMISION_LOCAL_PCT);

  if (opciones.contenidoId) {
    const contenido = await contenidosRepository.obtenerContenidoPorId(opciones.contenidoId);
    if (!contenido) {
      const err = new Error('El contenido especificado no existe.');
      err.status = 400;
      throw err;
    }
  }

  const generados = [];
  for (let i = 0; i < cantidad; i += 1) {
    let codigo;
    let intentos = 0;
    do {
      codigo = generarCodigoPin();
      intentos += 1;
      // eslint-disable-next-line no-await-in-loop
    } while ((await pinsRepository.obtenerPinPorCodigo(codigo)) && intentos < 5);

    // eslint-disable-next-line no-await-in-loop
    const id = await pinsRepository.crearPin({
      codigo,
      contenidoId: opciones.contenidoId ?? null,
      valorCop,
      comisionLocalPct,
      creadoPor: opciones.creadoPor ?? null,
      metodoGeneracion: opciones.metodoGeneracion ?? 'lote',
      fechaExpiracion: opciones.fechaExpiracion ?? null,
    });

    generados.push({ id, codigo, valorCop, comisionLocalPct, contenidoId: opciones.contenidoId ?? null });
  }

  return generados;
}

/**
 * Valida un PIN, lo marca como usado, registra la transacción económica
 * y devuelve una URL de descarga de corta duración.
 * @param {{codigo: string, contenidoId: number, ip?: string}} datos
 */
async function validarYConsumirPin({ codigo, contenidoId, ip }) {
  if (!codigo || !contenidoId) {
    return { ok: false, motivo: 'datos_incompletos' };
  }

  const pin = await pinsRepository.obtenerPinPorCodigo(String(codigo).trim().toUpperCase());
  if (!pin) {
    return { ok: false, motivo: 'pin_no_encontrado' };
  }
  if (pin.estado === 'usado') {
    return { ok: false, motivo: 'pin_ya_usado' };
  }
  if (pin.estado === 'anulado') {
    return { ok: false, motivo: 'pin_anulado' };
  }
  if (pin.fecha_expiracion && new Date(pin.fecha_expiracion).getTime() < Date.now()) {
    return { ok: false, motivo: 'pin_expirado' };
  }
  if (pin.contenido_id && Number(pin.contenido_id) !== Number(contenidoId)) {
    return { ok: false, motivo: 'pin_no_valido_para_este_contenido' };
  }

  const contenido = await contenidosRepository.obtenerContenidoPorId(contenidoId);
  if (!contenido || contenido.estado !== 'activo') {
    return { ok: false, motivo: 'contenido_no_encontrado' };
  }

  await pinsRepository.marcarPinUsado(pin.id, ip);

  const comisionCop = Math.round((pin.valor_cop * pin.comision_local_pct) / 100);
  await transaccionesRepository.registrarTransaccion({
    tipo: 'descarga_premium',
    pinId: pin.id,
    contenidoId,
    montoCop: pin.valor_cop,
    comisionCop,
    metodoPago: 'efectivo',
    clienteRef: ip ?? null,
  });

  // Intenta reflejar el ingreso en la central casi en tiempo real si hay
  // conexión. No bloquea la respuesta al cliente ni falla la validación
  // del PIN si la central está caída: el worker periódico ya cubre ese caso.
  centralSyncWorker.sincronizarEnSegundoPlano();

  const token = descargaToken.generarToken(contenidoId);

  return {
    ok: true,
    descargaUrl: `/api/contenidos/${contenidoId}/descargar?token=${token}`,
    valorCop: pin.valor_cop,
    comisionCop,
    expiraEnSegundos: 300,
  };
}

module.exports = { generarCodigoPin, crearLotePins, validarYConsumirPin };
