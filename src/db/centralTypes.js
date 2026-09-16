'use strict';

/**
 * Definiciones de tipos (JSDoc) que reflejan src/db/centralSchema.sql, el
 * esquema de la base de datos PostgreSQL central (Neon/Supabase).
 * Se usan como generic de Kysely para autocompletado en editores.
 *
 * @typedef {Object} NodoRow
 * @property {string} id
 * @property {string} nombre
 * @property {string|null} ubicacion
 * @property {Date} creado_en
 * @property {Date} ultima_vez_visto
 *
 * @typedef {Object} TransaccionCentralRow
 * @property {string} id
 * @property {string} nodo_id
 * @property {number} transaccion_local_id
 * @property {string} tipo
 * @property {number|null} pin_id_local
 * @property {number|null} contenido_id_local
 * @property {number} monto_cop
 * @property {number} comision_cop
 * @property {string} metodo_pago
 * @property {string|null} cliente_ref
 * @property {Date} creado_en_nodo
 * @property {Date} recibido_en
 *
 * @typedef {Object} HeartbeatRow
 * @property {string} id
 * @property {string} nodo_id
 * @property {number} disco_usado_mb
 * @property {number} disco_limite_mb
 * @property {number} uptime_segundos
 * @property {number} descargas_hoy
 * @property {number} pins_consumidos_hoy
 * @property {number} recaudado_hoy_cop
 * @property {number} contenidos_activos
 * @property {unknown} payload_bruto  -- jsonb con el heartbeat completo, por si se agregan campos a futuro
 * @property {Date} recibido_en
 *
 * @typedef {Object} CentralDatabase
 * @property {NodoRow} nodos
 * @property {TransaccionCentralRow} transacciones_centrales
 * @property {HeartbeatRow} heartbeats
 */

module.exports = {};
