'use strict';

/**
 * Aplica src/db/schema.sql sobre la base de datos local de forma
 * idempotente (CREATE TABLE IF NOT EXISTS), aplica migraciones
 * incrementales (columnas nuevas sobre tablas de Fase 1) y siembra datos
 * base (categorías, administrador inicial) si aún no existen.
 *
 * Seguro de correr sobre una base de datos de Fase 1 ya en producción:
 * no borra ni modifica datos existentes, solo agrega lo que falte.
 *
 * Uso: npm run db:migrate
 * También se ejecuta automáticamente en "postinstall".
 */

const fs = require('node:fs');
const path = require('node:path');
const { sqlite } = require('../config/database');
const env = require('../config/env');

const CATEGORIAS_BASE = [
  { nombre: 'Repositorio Educativo', slug: 'repositorio-educativo', icono: 'graduation-cap', orden: 1 },
  { nombre: 'Biblioteca Digital', slug: 'biblioteca-digital', icono: 'book-open', orden: 2 },
  { nombre: 'Guías de Estudio', slug: 'guias-de-estudio', icono: 'notebook', orden: 3 },
  { nombre: 'Manuales Técnicos', slug: 'manuales-tecnicos', icono: 'wrench', orden: 4 },
  { nombre: 'Formularios e Información Local', slug: 'formularios-info-local', icono: 'file-text', orden: 5 },
];

// Columnas agregadas en Fase 2 sobre tablas que ya existían en Fase 1.
// SQLite no soporta "ALTER TABLE ... ADD COLUMN IF NOT EXISTS", así que se
// introspecciona con PRAGMA table_info antes de intentar agregarlas.
const COLUMNAS_INCREMENTALES = [
  {
    tabla: 'transacciones',
    columna: 'sincronizado_central',
    definicion: 'INTEGER NOT NULL DEFAULT 0',
  },
  {
    tabla: 'transacciones',
    columna: 'fecha_sincronizado_central',
    definicion: 'TEXT',
  },
];

function aplicarEsquemaBase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  console.log('[migrate] Aplicando esquema SQLite (tablas base + Fase 2)...');
  sqlite.exec(schemaSql);
}

function columnaExiste(tabla, columna) {
  const columnas = sqlite.prepare(`PRAGMA table_info(${tabla})`).all();
  return columnas.some((c) => c.name === columna);
}

function aplicarColumnasIncrementales() {
  for (const { tabla, columna, definicion } of COLUMNAS_INCREMENTALES) {
    if (columnaExiste(tabla, columna)) continue;
    console.log(`[migrate] Agregando columna incremental: ${tabla}.${columna}`);
    sqlite.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

function sembrarCategorias() {
  const insertarCategoria = sqlite.prepare(
    `INSERT OR IGNORE INTO categorias (nombre, slug, icono, orden) VALUES (@nombre, @slug, @icono, @orden)`
  );

  // node:sqlite no expone un helper `.transaction()` como better-sqlite3,
  // así que la transacción se maneja con SQL explícito.
  sqlite.exec('BEGIN');
  try {
    for (const cat of CATEGORIAS_BASE) insertarCategoria.run(cat);
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
  console.log(`[migrate] Categorías base aseguradas (${CATEGORIAS_BASE.length}).`);
}

/**
 * Crea el administrador inicial del panel /admin si la tabla `admins`
 * está vacía, usando ADMIN_USUARIO / ADMIN_PASSWORD_INICIAL del .env.
 * Si ya existe al menos un admin, no hace nada (para no pisar una
 * contraseña que el operador ya cambió desde el panel).
 */
function sembrarAdminInicial() {
  const { total } = sqlite.prepare('SELECT COUNT(*) AS total FROM admins').get();
  if (total > 0) return;

  // require perezoso: bcryptjs solo hace falta aquí y en authService.js,
  // así migrate.js no falla si por alguna razón faltara la dependencia
  // en un entorno que aún no corrió "npm install".
  let bcrypt;
  try {
    bcrypt = require('bcryptjs');
  } catch (err) {
    console.warn(
      '[migrate] No se pudo cargar "bcryptjs" (¿falta "npm install"?). Se omite la creación del admin inicial:',
      err.message
    );
    return;
  }

  const hash = bcrypt.hashSync(env.ADMIN_PASSWORD_INICIAL, 10);
  sqlite
    .prepare('INSERT INTO admins (usuario, password_hash) VALUES (?, ?)')
    .run(env.ADMIN_USUARIO, hash);

  console.log(`[migrate] Administrador inicial creado: usuario "${env.ADMIN_USUARIO}".`);
  if (env.ADMIN_PASSWORD_INICIAL === 'cambiar123') {
    console.warn(
      '[migrate] ADVERTENCIA: estás usando la contraseña de admin por defecto ("cambiar123"). ' +
        'Cámbiala desde el panel /admin o define ADMIN_PASSWORD_INICIAL en .env antes de producción.'
    );
  }
}

function ejecutarMigracion() {
  aplicarEsquemaBase();
  aplicarColumnasIncrementales();
  sembrarCategorias();
  sembrarAdminInicial();
  console.log('[migrate] Migración completa.');
}

if (require.main === module) {
  try {
    ejecutarMigracion();
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Error aplicando migración:', err);
    process.exit(1);
  }
}

module.exports = { ejecutarMigracion };
