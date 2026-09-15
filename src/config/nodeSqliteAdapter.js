'use strict';

/**
 * Adaptador que envuelve el módulo nativo de Node `node:sqlite`
 * (incluido en el propio binario de Node desde la v22.5, sin ningún
 * paquete npm adicional) para que cumpla la interfaz que espera el
 * `SqliteDialect` de Kysely — la misma forma que expone `better-sqlite3`.
 *
 * Por qué existe este archivo:
 *   En Windows, `better-sqlite3` (y en general cualquier driver nativo:
 *   `sqlite3`, `@vscode/sqlite3`, `@libsql/client`) puede requerir
 *   compilar un addon C++ con node-gyp si no hay un binario precompilado
 *   para tu combinación exacta de Node/arquitectura, lo que exige tener
 *   Python y las "C++ build tools" de Visual Studio instaladas. Usar el
 *   módulo `node:sqlite`, que ya viene dentro de Node, elimina esa
 *   dependencia por completo: `npm install` no descarga ni compila nada
 *   para la base de datos.
 *
 * Requisitos: Node.js >= 22.5.0 (probado también en Node 24). El módulo
 * se reporta como "experimental" por Node (imprime un aviso en consola),
 * pero es estable para el uso síncrono que hace este proyecto.
 *
 * NOTA (temporalidad de este cambio): este adaptador resuelve el
 * problema de instalación en Windows para desarrollo. Si más adelante el
 * nodo de producción corre en un Raspberry Pi / TV Box con una versión
 * de Node anterior a la 22.5, habrá que revisar esta elección (ver
 * README, sección "Notas de diseño para hardware de bajos recursos").
 */

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  throw new Error(
    'No se pudo cargar el módulo nativo "node:sqlite". Este proyecto requiere Node.js >= 22.5.0 ' +
      '(recomendado: Node 24 LTS). Verifica tu versión con "node --version". ' +
      `Error original: ${err.message}`
  );
}

// Heurística para decidir si una sentencia devuelve filas (usar .all()/.iterate())
// o si es una escritura (usar .run()). node:sqlite no expone un equivalente al
// `.reader` de better-sqlite3, así que se infiere a partir del propio SQL.
// Cubre sobradamente los patrones que genera Kysely en este proyecto
// (SELECT / INSERT / UPDATE / DELETE / PRAGMA simples, sin CTEs recursivos raros).
const PATRON_SENTENCIA_LECTURA = /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i;

/**
 * @param {import('node:sqlite').DatabaseSync} conexion Conexión ya abierta.
 * @returns {import('kysely').SqliteDatabase} Objeto compatible con SqliteDialect.
 */
function crearAdaptadorKysely(conexion) {
  return {
    close() {
      conexion.close();
    },
    prepare(sql) {
      const sentencia = conexion.prepare(sql);
      return {
        reader: PATRON_SENTENCIA_LECTURA.test(sql),
        all(parametros) {
          return sentencia.all(...parametros);
        },
        run(parametros) {
          const resultado = sentencia.run(...parametros);
          // node:sqlite ya devuelve { changes, lastInsertRowid }, igual que
          // better-sqlite3, así que no hace falta remapear campos.
          return resultado;
        },
        iterate(parametros) {
          return sentencia.iterate(...parametros);
        },
      };
    },
  };
}

/**
 * Abre (o crea) el archivo SQLite en `rutaArchivo` y devuelve tanto la
 * conexión nativa cruda (para usos puntuales como migraciones/seeds que
 * necesitan `.exec()` o parámetros nombrados) como el adaptador listo
 * para pasarle a `new SqliteDialect({ database })`.
 */
function abrirBaseDeDatos(rutaArchivo) {
  const conexion = new DatabaseSync(rutaArchivo);
  return { conexion, adaptadorKysely: crearAdaptadorKysely(conexion) };
}

module.exports = { abrirBaseDeDatos, crearAdaptadorKysely, DatabaseSync };
