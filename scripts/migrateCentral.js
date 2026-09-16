'use strict';

/**
 * Aplica src/db/centralSchema.sql sobre CENTRAL_DATABASE_URL (Neon/Supabase).
 * A diferencia de la migración de SQLite local, esta NO se ejecuta
 * automáticamente (ni en postinstall ni al arrancar el servidor): es un
 * paso manual que el operador corre una sola vez al aprovisionar la base
 * central, o cuando se actualiza centralSchema.sql.
 *
 * Uso: npm run db:migrate:central
 */

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const env = require('../src/config/env');

async function migrarCentral() {
  if (!env.CENTRAL_DATABASE_URL) {
    console.error('[migrate:central] CENTRAL_DATABASE_URL no está definida en .env. Nada que hacer.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: env.CENTRAL_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const schemaPath = path.join(__dirname, '..', 'src', 'db', 'centralSchema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  console.log('[migrate:central] Conectando a la base de datos central...');
  const cliente = await pool.connect();
  try {
    console.log('[migrate:central] Aplicando centralSchema.sql...');
    await cliente.query(schemaSql);
    console.log('[migrate:central] Esquema central listo (nodos, transacciones_centrales, heartbeats).');
  } finally {
    cliente.release();
    await pool.end();
  }
}

migrarCentral().catch((err) => {
  console.error('[migrate:central] Error aplicando el esquema central:', err.message);
  process.exit(1);
});
