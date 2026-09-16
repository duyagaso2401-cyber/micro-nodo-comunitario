'use strict';

/**
 * Acceso a datos sobre la base de datos PostgreSQL central. Cada función
 * pide el cliente Kysely vigente con `centralDatabase.obtenerDb()` en el
 * momento de ejecutarse (no lo importa una sola vez al cargar el módulo),
 * para que una reconexión en caliente (cadena de conexión actualizada, o
 * reconstrucción tras varios fallos) la vean todas las llamadas siguientes
 * sin reiniciar el proceso. Si `obtenerDb()` devuelve `null`, cada función
 * lanza un error claro en vez de fallar con un TypeError críptico.
 */

const centralDatabase = require('../config/centralDatabase');
const env = require('../config/env');

function obtenerDbOLanzar() {
  const db = centralDatabase.obtenerDb();
  if (!db) {
    throw new Error('La base de datos central no está configurada (CENTRAL_DATABASE_URL vacía).');
  }
  return db;
}

/** Registra/actualiza este nodo en la tabla `nodos` de la central. */
async function upsertNodo() {
  const db = obtenerDbOLanzar();
  await db
    .insertInto('nodos')
    .values({
      id: env.NODO_ID,
      nombre: env.NODO_NOMBRE,
      ubicacion: env.NODO_UBICACION,
    })
    .onConflict((oc) =>
      oc.column('id').doUpdateSet({
        nombre: env.NODO_NOMBRE,
        ubicacion: env.NODO_UBICACION,
        ultima_vez_visto: new Date(),
      })
    )
    .execute();
}

/**
 * Inserta un lote de transacciones locales en la central. Es idempotente:
 * si una transacción con el mismo (nodo_id, transaccion_local_id) ya
 * existe (por ejemplo, un reintento tras una caída de red a mitad de
 * envío), simplemente se omite sin error.
 * @param {Array<object>} transaccionesLocales filas de la tabla `transacciones` de SQLite
 */
async function insertarLoteTransacciones(transaccionesLocales) {
  const db = obtenerDbOLanzar();
  if (transaccionesLocales.length === 0) return;

  const filas = transaccionesLocales.map((t) => ({
    nodo_id: env.NODO_ID,
    transaccion_local_id: t.id,
    tipo: t.tipo,
    pin_id_local: t.pin_id,
    contenido_id_local: t.contenido_id,
    monto_cop: t.monto_cop,
    comision_cop: t.comision_cop,
    metodo_pago: t.metodo_pago,
    cliente_ref: t.cliente_ref,
    creado_en_nodo: new Date(t.creado_en),
  }));

  await db.insertInto('transacciones_centrales').values(filas).onConflict((oc) => oc.doNothing()).execute();
}

/** Inserta un registro de heartbeat/telemetría en la central. */
async function insertarHeartbeat(datos) {
  const db = obtenerDbOLanzar();
  await db
    .insertInto('heartbeats')
    .values({
      nodo_id: env.NODO_ID,
      disco_usado_mb: Math.round(datos.discoUsadoMB),
      disco_limite_mb: datos.discoLimiteMB,
      uptime_segundos: Math.round(datos.uptimeSegundos),
      descargas_hoy: datos.descargasHoy,
      pins_consumidos_hoy: datos.pinsConsumidosHoy,
      recaudado_hoy_cop: datos.recaudadoHoyCop,
      contenidos_activos: datos.contenidosActivos,
      payload_bruto: JSON.stringify(datos),
    })
    .execute();
}

module.exports = { upsertNodo, insertarLoteTransacciones, insertarHeartbeat };
