'use strict';

/**
 * Datos de ejemplo opcionales para probar el flujo de PIN/cobro sin
 * esperar al worker de sincronización. Idempotente: no duplica si ya
 * existe un contenido con el mismo título de ejemplo.
 *
 * Uso: npm run db:seed
 */

const { ejecutarMigracion } = require('../src/db/migrate');
const categoriasRepository = require('../src/repositories/categoriasRepository');
const contenidosRepository = require('../src/repositories/contenidosRepository');
const pinService = require('../src/services/pinService');

const TITULO_EJEMPLO = 'Manual de Ejemplo (contenido premium de prueba)';

async function seed() {
  ejecutarMigracion();

  const categoria = await categoriasRepository.obtenerCategoriaPorSlug('manuales-tecnicos');

  const contenidos = await contenidosRepository.listarContenidos({ busqueda: TITULO_EJEMPLO });
  let contenidoId;

  if (contenidos.length > 0) {
    contenidoId = contenidos[0].id;
    console.log(`[seed] Contenido de ejemplo ya existe (id=${contenidoId}).`);
  } else {
    contenidoId = await contenidosRepository.crearContenido({
      categoriaId: categoria ? categoria.id : null,
      titulo: TITULO_EJEMPLO,
      descripcion: 'Contenido de ejemplo (sin archivo real) para probar el flujo de PIN antes de que corra el worker.',
      autor: 'Equipo del proyecto',
      tipo: 'doc',
      etiquetas: 'ejemplo,prueba',
      archivoPath: null,
      tamanoBytes: 0,
      fuenteProveedor: 'manual',
      esPremium: true,
    });
    console.log(`[seed] Contenido de ejemplo creado (id=${contenidoId}).`);
  }

  const pins = await pinService.crearLotePins({
    cantidad: 3,
    contenidoId,
    creadoPor: 'seed-script',
    metodoGeneracion: 'lote',
  });

  console.log('[seed] PINs de prueba generados:');
  for (const pin of pins) {
    console.log(`  -> ${pin.codigo}  (valor: $${pin.valorCop} COP, contenido: ${pin.contenidoId})`);
  }
  console.log('\n[seed] Prueba el flujo con, por ejemplo:');
  console.log(
    `  curl -X POST http://localhost:3000/api/pins/validar -H "Content-Type: application/json" -d '{"codigo":"${pins[0].codigo}","contenidoId":${contenidoId}}'`
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Error:', err);
    process.exit(1);
  });
