-- ==========================================================================
-- Micro-Nodo Comunitario - Esquema SQLite (Fase 1)
-- Se ejecuta de forma idempotente vía src/db/migrate.js
-- ==========================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------------
-- categorias: agrupan los contenidos del catálogo (Repositorio Educativo,
-- Biblioteca Digital, Manuales Técnicos, Guías de Estudio, etc.)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  descripcion   TEXT,
  icono         TEXT DEFAULT 'folder',
  orden         INTEGER NOT NULL DEFAULT 0,
  creado_en     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- --------------------------------------------------------------------------
-- contenidos: cada archivo/recurso indexado en el nodo (PDF, EPUB, MP3, etc.)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contenidos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria_id          INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  titulo                TEXT NOT NULL,
  descripcion           TEXT,
  autor                 TEXT,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('pdf','epub','mp3','video','doc','otro')),
  etiquetas             TEXT,                     -- CSV simple: "salud,agricultura,manual"
  archivo_path          TEXT,                     -- ruta relativa dentro de DOWNLOADS_PATH
  archivo_hash          TEXT,                     -- sha256 para evitar duplicados
  tamano_bytes          INTEGER NOT NULL DEFAULT 0,
  fuente_url            TEXT,                     -- URL de origen (para trazabilidad/re-descarga)
  fuente_proveedor      TEXT,                     -- ej. "gutendex" / "manual" / "local"
  es_premium            INTEGER NOT NULL DEFAULT 0 CHECK (es_premium IN (0,1)),
  estado                TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','eliminado','pendiente')),
  veces_consultado      INTEGER NOT NULL DEFAULT 0,
  veces_descargado      INTEGER NOT NULL DEFAULT 0,
  prioridad_cache       INTEGER NOT NULL DEFAULT 0,   -- mayor = más protegido contra limpieza automática
  fecha_agregado        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fecha_ultima_consulta TEXT
);

CREATE INDEX IF NOT EXISTS idx_contenidos_categoria ON contenidos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_contenidos_estado ON contenidos(estado);
CREATE INDEX IF NOT EXISTS idx_contenidos_premium ON contenidos(es_premium);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contenidos_hash ON contenidos(archivo_hash) WHERE archivo_hash IS NOT NULL;

-- --------------------------------------------------------------------------
-- pins_acceso: tokens de acceso que habilitan descargas premium
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pins_acceso (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo            TEXT NOT NULL UNIQUE,           -- código alfanumérico entregado al usuario
  contenido_id      INTEGER REFERENCES contenidos(id) ON DELETE SET NULL, -- NULL = acceso global (todo premium)
  valor_cop         INTEGER NOT NULL DEFAULT 0,
  comision_local_pct INTEGER NOT NULL DEFAULT 0,
  estado            TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible','usado','anulado','expirado')),
  creado_por        TEXT,                           -- identificador del dueño del local / punto de venta
  metodo_generacion TEXT NOT NULL DEFAULT 'manual' CHECK (metodo_generacion IN ('manual','qr','lote')),
  fecha_creacion    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  fecha_expiracion  TEXT,
  fecha_uso         TEXT,
  usado_por_ip      TEXT
);

CREATE INDEX IF NOT EXISTS idx_pins_estado ON pins_acceso(estado);
CREATE INDEX IF NOT EXISTS idx_pins_contenido ON pins_acceso(contenido_id);

-- --------------------------------------------------------------------------
-- transacciones: todo movimiento económico del nodo (venta de PIN, descarga
-- premium, publicidad) para reporte de monetización y telemetría
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacciones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('venta_pin','descarga_premium','publicidad','otro')),
  pin_id          INTEGER REFERENCES pins_acceso(id) ON DELETE SET NULL,
  contenido_id    INTEGER REFERENCES contenidos(id) ON DELETE SET NULL,
  monto_cop       INTEGER NOT NULL DEFAULT 0,
  comision_cop    INTEGER NOT NULL DEFAULT 0,
  metodo_pago     TEXT NOT NULL DEFAULT 'efectivo' CHECK (metodo_pago IN ('efectivo','qr_nequi','qr_daviplata','qr_wompi','otro')),
  estado          TEXT NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada','anulada','pendiente')),
  cliente_ref     TEXT,                             -- IP/MAC/hash anónimo del dispositivo cliente, opcional
  creado_en       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_transacciones_tipo ON transacciones(tipo);
CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(creado_en);

-- --------------------------------------------------------------------------
-- nodo_config: configuración clave-valor persistida del nodo (identidad,
-- parámetros operativos ajustables sin redeploy)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nodo_config (
  clave           TEXT PRIMARY KEY,
  valor           TEXT NOT NULL,
  actualizado_en  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ==========================================================================
-- Fase 2 — tablas agregadas. Se crean con CREATE TABLE IF NOT EXISTS, así
-- que aplicar este esquema sobre una base de datos de Fase 1 ya en uso es
-- seguro: las tablas existentes no se tocan, solo se agregan las nuevas.
-- Las columnas nuevas sobre tablas de Fase 1 (transacciones) se agregan por
-- separado en src/db/migrate.js con ALTER TABLE + introspección, porque
-- SQLite no soporta "ADD COLUMN IF NOT EXISTS".
-- ==========================================================================

-- --------------------------------------------------------------------------
-- admins: usuarios con acceso al panel /admin (autenticación por sesión)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario         TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,           -- bcryptjs
  creado_en       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ultimo_acceso   TEXT
);

-- --------------------------------------------------------------------------
-- log_sincronizacion: historial de corridas de los workers en segundo plano
-- (sync de contenido con Gutendex, sync de transacciones con la central,
-- envío de heartbeats), visible en el panel de administración.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_sincronizacion (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo                TEXT NOT NULL CHECK (tipo IN ('contenido','transacciones_central','heartbeat')),
  estado              TEXT NOT NULL CHECK (estado IN ('exito','error','omitido')),
  detalle             TEXT,                 -- mensaje corto legible
  registros_procesados INTEGER NOT NULL DEFAULT 0,
  duracion_ms         INTEGER,
  creado_en           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_log_sync_tipo ON log_sincronizacion(tipo);
CREATE INDEX IF NOT EXISTS idx_log_sync_fecha ON log_sincronizacion(creado_en);

-- --------------------------------------------------------------------------
-- anuncios: publicidad local (comercios del sector) mostrada antes de
-- descargas de contenido gratuito.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anuncios (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo                TEXT NOT NULL,
  imagen_url            TEXT NOT NULL,        -- ruta local (/uploads/anuncios/..) o URL externa
  link                  TEXT,                 -- a dónde apunta si el usuario hace clic (opcional)
  impresiones_max       INTEGER NOT NULL DEFAULT 0,   -- 0 = sin límite
  impresiones_actuales  INTEGER NOT NULL DEFAULT 0,
  activo                INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1)),
  creado_en             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_anuncios_activo ON anuncios(activo);

-- --------------------------------------------------------------------------
-- registro_descargas: un evento por cada descarga servida (gratis o
-- premium). contenidos.veces_descargado sigue siendo el contador rápido de
-- toda la vida del contenido; esta tabla existe para poder responder
-- "¿cuántas descargas hubo HOY?" (requerido por el heartbeat de Fase 2 y
-- por el panel de administración), algo que un contador acumulado no
-- puede responder por sí solo.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registro_descargas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  contenido_id  INTEGER REFERENCES contenidos(id) ON DELETE SET NULL,
  es_premium    INTEGER NOT NULL DEFAULT 0 CHECK (es_premium IN (0,1)),
  creado_en     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_registro_descargas_fecha ON registro_descargas(creado_en);
