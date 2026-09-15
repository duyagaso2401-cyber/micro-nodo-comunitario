'use strict';

function marcaDeTiempo() {
  return new Date().toISOString();
}

function info(etiqueta, ...args) {
  console.log(`[${marcaDeTiempo()}] [INFO] [${etiqueta}]`, ...args);
}

function warn(etiqueta, ...args) {
  console.warn(`[${marcaDeTiempo()}] [WARN] [${etiqueta}]`, ...args);
}

function error(etiqueta, ...args) {
  console.error(`[${marcaDeTiempo()}] [ERROR] [${etiqueta}]`, ...args);
}

module.exports = { info, warn, error };
