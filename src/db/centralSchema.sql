-- ==========================================================================
-- Micro-Nodo Comunitario - Esquema PostgreSQL CENTRAL (Fase 2)
-- Para Neon / Supabase / cualquier Postgres administrado.
--
-- Este esquema NO se aplica automáticamente al arrancar el servidor (a
-- diferencia del SQLite local). Se aplica una sola vez, manualmente, desde
-- una máquina con acceso a CENTRAL_DATABASE_URL:
--
--   npm run db:migrate:central
--
-- Diseño: cada nodo comunitario es una fila en "nodos"; cada transacción
-- económica local que se sincroniza aterriza en "transacciones_centrales"
-- con una restricción UNIQUE (nodo_id, transaccion_local_id) que hace que
-- reintentar el mismo lote sea seguro (upsert idempotente, ON CONFLICT DO
-- NOTHING) incluso si el nodo se queda sin conexión a mitad de un envío.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS nodos (
  id              TEXT PRIMARY KEY,          -- coincide con NODO_ID de cada nodo
  nombre          TEXT NOT NULL,
  ubicacion       TEXT,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_vez_visto TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transacciones_centrales (
  id                    BIGSERIAL PRIMARY KEY,
  nodo_id               TEXT NOT NULL REFERENCES nodos(id),
  transaccion_local_id  INTEGER NOT NULL,      -- id de la fila en la tabla `transacciones` del SQLite local
  tipo                  TEXT NOT NULL,
  pin_id_local          INTEGER,
  contenido_id_local    INTEGER,
  monto_cop             INTEGER NOT NULL DEFAULT 0,
  comision_cop          INTEGER NOT NULL DEFAULT 0,
  metodo_pago           TEXT NOT NULL DEFAULT 'efectivo',
  cliente_ref           TEXT,
  creado_en_nodo        TIMESTAMPTZ NOT NULL,   -- timestamp original de la transacción en el nodo
  recibido_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nodo_id, transaccion_local_id)
);

CREATE INDEX IF NOT EXISTS idx_transacciones_centrales_nodo ON transacciones_centrales(nodo_id);
CREATE INDEX IF NOT EXISTS idx_transacciones_centrales_fecha ON transacciones_centrales(creado_en_nodo);

CREATE TABLE IF NOT EXISTS heartbeats (
  id                    BIGSERIAL PRIMARY KEY,
  nodo_id               TEXT NOT NULL REFERENCES nodos(id),
  disco_usado_mb        INTEGER NOT NULL DEFAULT 0,
  disco_limite_mb       INTEGER NOT NULL DEFAULT 0,
  uptime_segundos       INTEGER NOT NULL DEFAULT 0,
  descargas_hoy         INTEGER NOT NULL DEFAULT 0,
  pins_consumidos_hoy   INTEGER NOT NULL DEFAULT 0,
  recaudado_hoy_cop     INTEGER NOT NULL DEFAULT 0,
  contenidos_activos    INTEGER NOT NULL DEFAULT 0,
  payload_bruto         JSONB,
  recibido_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_nodo ON heartbeats(nodo_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_fecha ON heartbeats(recibido_en);

-- Vista de conveniencia: último heartbeat conocido de cada nodo, útil para
-- un futuro dashboard central ("¿qué nodos están vivos ahora mismo?").
CREATE OR REPLACE VIEW nodos_estado_actual AS
SELECT DISTINCT ON (h.nodo_id)
  h.nodo_id,
  n.nombre,
  n.ubicacion,
  h.disco_usado_mb,
  h.disco_limite_mb,
  h.descargas_hoy,
  h.pins_consumidos_hoy,
  h.recaudado_hoy_cop,
  h.contenidos_activos,
  h.recibido_en AS ultimo_heartbeat
FROM heartbeats h
JOIN nodos n ON n.id = h.nodo_id
ORDER BY h.nodo_id, h.recibido_en DESC;
