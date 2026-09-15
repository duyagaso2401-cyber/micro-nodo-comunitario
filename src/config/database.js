'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Kysely, SqliteDialect } = require('kysely');
const env = require('./env');
const { abrirBaseDeDatos } = require('./nodeSqliteAdapter');

// eslint-disable-next-line no-unused-vars -- referenciado solo para el generic de Kysely (JSDoc)
const types = require('../db/types');

fs.mkdirSync(path.dirname(env.DB_PATH), { recursive: true });
fs.mkdirSync(env.DOWNLOADS_PATH, { recursive: true });

// Driver: módulo nativo `node:sqlite` (incluido en Node >= 22.5, sin
// dependencias npm ni compilación C++). Ver src/config/nodeSqliteAdapter.js
// para el porqué de este cambio frente a better-sqlite3.
const { conexion: sqlite, adaptadorKysely } = abrirBaseDeDatos(env.DB_PATH);

sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

/** @type {Kysely<import('../db/types').Database>} */
const db = new Kysely({
  dialect: new SqliteDialect({ database: adaptadorKysely }),
});

module.exports = { db, sqlite };
