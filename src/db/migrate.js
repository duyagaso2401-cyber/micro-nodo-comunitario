'use strict';

/**
 * Aplica src/db/schema.sql sobre la base de datos local de forma
 * idempotente (CREATE TABLE IF NOT EXISTS) y siembra las categorías
 * base del catálogo si aún no existen.
 *
 * Uso: npm run db:migrate
 * También se ejecuta automáticamente en "postinstall".
 */

const fs = require('node:fs');
const path = require('node:path');
const { sqlite } = require('../config/database');

const CATEGORIAS_BASE = [
  { nombre: 'Repositorio Educativo', slug: 'repositorio-educativo', icono: 'graduation-cap', orden: 1 },
  { nombre: 'Biblioteca Digital', slug: 'biblioteca-digital', icono: 'book-open', orden: 2 },
  { nombre: 'Guías de Estudio', slug: 'guias-de-estudio', icono: 'notebook', orden: 3 },
  { nombre: 'Manuales Técnicos', slug: 'manuales-tecnicos', icono: 'wrench', orden: 4 },
  { nombre: 'Formularios e Información Local', slug: 'formularios-info-local', icono: 'file-text', orden: 5 },
];

function ejecutarMigracion() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  console.log('[migrate] Aplicando esquema SQLite...');
  sqlite.exec(schemaSql);

  const insertarCategoria = sqlite.prepare(
    `INSERT OR IGNORE INTO categorias (nombre, slug, icono, orden) VALUES (@nombre, @slug, @icono, @orden)`
  );

  // node:sqlite no expone un helper `.transaction()` como better-sqlite3,
  // así que la transacción se maneja con SQL explícito. Son solo 5 filas
  // de siembra, así que el costo es mínimo.
  sqlite.exec('BEGIN');
  try {
    for (const cat of CATEGORIAS_BASE) insertarCategoria.run(cat);
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }

  console.log(`[migrate] Esquema listo. Categorías base aseguradas (${CATEGORIAS_BASE.length}).`);
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
