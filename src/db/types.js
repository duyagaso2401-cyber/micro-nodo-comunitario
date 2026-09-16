'use strict';

/**
 * Definiciones de tipos (JSDoc) que reflejan src/db/schema.sql.
 * Se usan como generic de Kysely para autocompletado en editores,
 * sin necesidad de compilar TypeScript en Fase 1.
 *
 * @typedef {Object} CategoriaRow
 * @property {number} id
 * @property {string} nombre
 * @property {string} slug
 * @property {string|null} descripcion
 * @property {string} icono
 * @property {number} orden
 * @property {string} creado_en
 *
 * @typedef {Object} ContenidoRow
 * @property {number} id
 * @property {number|null} categoria_id
 * @property {string} titulo
 * @property {string|null} descripcion
 * @property {string|null} autor
 * @property {'pdf'|'epub'|'mp3'|'video'|'doc'|'otro'} tipo
 * @property {string|null} etiquetas
 * @property {string|null} archivo_path
 * @property {string|null} archivo_hash
 * @property {number} tamano_bytes
 * @property {string|null} fuente_url
 * @property {string|null} fuente_proveedor
 * @property {0|1} es_premium
 * @property {'activo'|'eliminado'|'pendiente'} estado
 * @property {number} veces_consultado
 * @property {number} veces_descargado
 * @property {number} prioridad_cache
 * @property {string} fecha_agregado
 * @property {string|null} fecha_ultima_consulta
 *
 * @typedef {Object} PinAccesoRow
 * @property {number} id
 * @property {string} codigo
 * @property {number|null} contenido_id
 * @property {number} valor_cop
 * @property {number} comision_local_pct
 * @property {'disponible'|'usado'|'anulado'|'expirado'} estado
 * @property {string|null} creado_por
 * @property {'manual'|'qr'|'lote'} metodo_generacion
 * @property {string} fecha_creacion
 * @property {string|null} fecha_expiracion
 * @property {string|null} fecha_uso
 * @property {string|null} usado_por_ip
 *
 * @typedef {Object} TransaccionRow
 * @property {number} id
 * @property {'venta_pin'|'descarga_premium'|'publicidad'|'otro'} tipo
 * @property {number|null} pin_id
 * @property {number|null} contenido_id
 * @property {number} monto_cop
 * @property {number} comision_cop
 * @property {'efectivo'|'qr_nequi'|'qr_daviplata'|'qr_wompi'|'otro'} metodo_pago
 * @property {'confirmada'|'anulada'|'pendiente'} estado
 * @property {string|null} cliente_ref
 * @property {string} creado_en
 * @property {0|1} sincronizado_central
 * @property {string|null} fecha_sincronizado_central
 *
 * @typedef {Object} NodoConfigRow
 * @property {string} clave
 * @property {string} valor
 * @property {string} actualizado_en
 *
 * @typedef {Object} AdminRow
 * @property {number} id
 * @property {string} usuario
 * @property {string} password_hash
 * @property {string} creado_en
 * @property {string|null} ultimo_acceso
 *
 * @typedef {Object} LogSincronizacionRow
 * @property {number} id
 * @property {'contenido'|'transacciones_central'|'heartbeat'} tipo
 * @property {'exito'|'error'|'omitido'} estado
 * @property {string|null} detalle
 * @property {number} registros_procesados
 * @property {number|null} duracion_ms
 * @property {string} creado_en
 *
 * @typedef {Object} AnuncioRow
 * @property {number} id
 * @property {string} titulo
 * @property {string} imagen_url
 * @property {string|null} link
 * @property {number} impresiones_max
 * @property {number} impresiones_actuales
 * @property {0|1} activo
 * @property {string} creado_en
 *
 * @typedef {Object} RegistroDescargaRow
 * @property {number} id
 * @property {number|null} contenido_id
 * @property {0|1} es_premium
 * @property {string} creado_en
 *
 * @typedef {Object} Database
 * @property {CategoriaRow} categorias
 * @property {ContenidoRow} contenidos
 * @property {PinAccesoRow} pins_acceso
 * @property {TransaccionRow} transacciones
 * @property {NodoConfigRow} nodo_config
 * @property {AdminRow} admins
 * @property {LogSincronizacionRow} log_sincronizacion
 * @property {AnuncioRow} anuncios
 * @property {RegistroDescargaRow} registro_descargas
 */

module.exports = {};
