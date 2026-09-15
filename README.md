# Micro-Nodo Comunitario — Fase 1 (MVP de Arquitectura Core)

Plataforma web local *offline-first* para desplegar en micro-servidores de bajo
consumo (Mini PC / Raspberry Pi / TV Box con Linux), pensada para prestar
contenido educativo, biblioteca digital y servicios de descarga a comunidades
con conectividad inestable — con sincronización autónoma nocturna y un modelo
de monetización simple basado en PINs.

Esta entrega cubre la **Fase 1**: el núcleo del backend, el esquema de datos,
el worker de sincronización, el endpoint de PIN/cobro y el portal cautivo
básico. La telemetría remota hacia un backend central (Neon/Supabase) y la
integración real de pasarelas de pago (Wompi/Nequi/Daviplata) quedan
señaladas como puntos de extensión para la Fase 2.

## Stack técnico

- **Backend:** Node.js (>= 22.5) + Express
- **Base de datos:** SQLite vía el módulo nativo **`node:sqlite`** (incluido en Node, cero dependencias npm ni compilación C++) con **Kysely** como query builder tipado — ver [`src/config/nodeSqliteAdapter.js`](./src/config/nodeSqliteAdapter.js)
- **Worker:** `node-cron` + fetch nativo de Node 18+
- **Frontend:** HTML5 + Tailwind CSS (compilado, sin CDN) + JavaScript vainilla
- **Fuente de contenido (Fase 1):** [Gutendex](https://gutendex.com) — API pública sobre Project Gutenberg (libros de dominio público, sin API key)

## Estructura del proyecto

```
micro-nodo-comunitario/
├── package.json
├── .env.example
├── tailwind.config.js
├── src/
│   ├── server.js                  # Bootstrap de Express
│   ├── config/
│   │   ├── env.js                 # Lectura centralizada de variables de entorno
│   │   ├── database.js            # Conexión Kysely + node:sqlite
│   │   └── nodeSqliteAdapter.js    # Adaptador node:sqlite -> interfaz SqliteDialect de Kysely
│   ├── db/
│   │   ├── schema.sql             # DDL: contenidos, categorias, transacciones, pins_acceso, nodo_config
│   │   ├── types.js                # Tipos JSDoc para el generic de Kysely
│   │   └── migrate.js             # Aplica el esquema + siembra categorías base
│   ├── repositories/              # Acceso a datos (una función por consulta)
│   ├── services/
│   │   └── pinService.js          # Reglas de negocio de PIN / monetización
│   ├── controllers/                # Traducen HTTP <-> servicios/repositorios
│   ├── routes/                    # Definición de endpoints Express
│   ├── middlewares/
│   ├── workers/
│   │   ├── syncWorker.js          # Orquestador del ciclo de sincronización
│   │   ├── diskManager.js         # Rotación de caché / límite de disco
│   │   └── sources/gutendexSource.js
│   ├── styles/input.css           # Entrada de Tailwind
│   └── utils/
├── public/                        # Portal cautivo (servido como estático)
│   ├── index.html
│   ├── js/app.js
│   └── css/output.css             # Generado por `npm run css:build`
├── data/                          # DB local + archivos descargados (gitignored)
└── scripts/seed.js                # Datos de ejemplo opcionales
```

## Puesta en marcha

> **Requisito de versión:** Node.js **>= 22.5** (recomendado: Node 24 LTS).
> El proyecto usa el módulo nativo `node:sqlite` como driver de base de
> datos, así que `npm install` **no compila nada en C++** ni necesita
> Python / Visual Studio Build Tools — ideal para Windows. Verifica tu
> versión con `node --version` antes de instalar.

```bash
cp .env.example .env               # ajustar valores del nodo
npm install                        # instala dependencias y corre la migración (postinstall)
npm run css:build                  # compila Tailwind -> public/css/output.css
npm start                          # arranca el servidor en http://localhost:3000
```

Scripts disponibles (`package.json`):

| Script              | Qué hace                                                        |
|---------------------|-------------------------------------------------------------------|
| `npm start`         | Arranca el servidor Express + programador del sync worker        |
| `npm run dev`       | Igual que `start`, con recarga automática (`node --watch`)        |
| `npm run db:migrate`| Aplica `schema.sql` y siembra categorías base (idempotente)      |
| `npm run sync`      | Ejecuta el worker de sincronización una sola vez, manualmente    |
| `npm run css:build` | Compila Tailwind a `public/css/output.css` (minificado)          |
| `npm run css:watch` | Recompila Tailwind en modo watch durante desarrollo               |

## Esquema de base de datos (Fase 1)

- **`categorias`** — agrupan el catálogo (Repositorio Educativo, Biblioteca Digital, Manuales Técnicos, Guías de Estudio, Formularios e Información Local).
- **`contenidos`** — cada archivo indexado: tipo, tamaño, hash, ruta en disco, si es premium, contadores de consulta/descarga y `prioridad_cache` (usada por la rotación automática).
- **`pins_acceso`** — tokens de acceso a descargas premium: código, valor en COP, comisión del local, estado (`disponible` / `usado` / `anulado` / `expirado`).
- **`transacciones`** — todo movimiento económico (venta de PIN, descarga premium, publicidad) con monto, comisión y método de pago — es la fuente para el reporte diario de monetización.
- **`nodo_config`** — configuración clave-valor persistida (identidad del nodo, última sincronización, etc.).

Ver el detalle completo en [`src/db/schema.sql`](./src/db/schema.sql).

## Worker de sincronización

`src/workers/syncWorker.js` corre por defecto a las **2:00 AM** (configurable
vía `SYNC_CRON_EXPRESION`) y:

1. Consulta la API pública de Gutendex (libros en español, ordenados por popularidad).
2. Descarga los formatos disponibles (prioriza EPUB, luego PDF, luego texto plano).
3. Calcula el hash SHA-256 de cada archivo para evitar duplicados y omite lo ya indexado (por URL de origen o por hash).
4. Inserta metadatos en `contenidos`, bajo la categoría "Biblioteca Digital".
5. Ejecuta `diskManager.liberarEspacioSiNecesario()`: si el uso de disco supera `DISCO_UMBRAL_LIMPIEZA_PCT` de `DISCO_LIMITE_MB`, elimina automáticamente los contenidos sincronizados de menor prioridad/demanda (nunca toca contenido subido manualmente).

Para probarlo sin esperar al cron: `npm run sync`.

> **Nota:** Gutendex es la fuente real usada en Fase 1 para que el worker sea
> funcional desde el primer día. Añadir una nueva fuente es tan simple como
> crear un módulo en `src/workers/sources/` que devuelva la misma forma de
> objeto (`titulo`, `tipo`, `urlArchivo`, `fuenteUrl`, …) y enchufarlo en
> `syncWorker.js`.

## Monetización: PIN y cobro

- `POST /api/pins/generar` *(requiere header `x-admin-key`)* — genera uno o varios PINs (`cantidad`, `valorCop`, `comisionLocalPct`, `contenidoId` opcional para atarlo a un recurso específico).
- `POST /api/pins/validar` *(público)* — el portal cautivo envía `{ codigo, contenidoId }`; si el PIN es válido lo marca como `usado`, registra la transacción (monto + comisión) y devuelve una `descargaUrl` firmada, válida por 5 minutos.
- `GET /api/contenidos/:id/descargar?token=...` — sirve el archivo. Para contenido premium exige el token emitido por `/api/pins/validar`; para contenido gratuito no requiere token.
- `GET /api/pins/estado/:codigo` *(requiere `x-admin-key`)* — consulta el estado de un PIN sin consumirlo.

Fase 1 implementa **solo la lógica local** de PIN/comisión/transacción. El
cobro por QR (Nequi/Daviplata/Wompi) y la publicidad de comercios locales
quedan como módulos a integrar en Fase 2, sobre esta misma tabla
`transacciones` y el mismo flujo de `descargaUrl` firmada.

## Portal cautivo (frontend)

`public/index.html` + `public/js/app.js`: catálogo mobile-first con buscador,
filtro por categoría, tarjetas de contenido (con insignia "Gratis" / "🔒
Premium") y un modal para ingresar el PIN antes de descargar contenido
premium. Sin frameworks de frontend ni CDN externos — todo se sirve desde el
propio nodo, incluido el CSS de Tailwind ya compilado.

## Próximos pasos (Fase 2, fuera de este alcance)

- Canal de telemetría (WebSocket/heartbeat HTTP) hacia un backend central (Neon/Supabase): salud del nodo, usuarios conectados, monetización del día.
- Integración real de QR dinámico (Wompi/Nequi/Daviplata) sobre el mismo flujo de `transacciones`.
- Módulo de publicidad local (banners/video corto de comercios al iniciar sesión o descargar).
- Panel de administración web (hoy los endpoints admin solo están protegidos por `x-admin-key`; conviene una UI + autenticación real).
- Portal cautivo real a nivel de red (redirección DNS/HTTP del router hacia este servidor).
- **Revisar el driver de base de datos para producción en Raspberry Pi/TV Box** (ver nota abajo): confirmar que el Node instalado en el hardware final sea >= 22.5, o volver a `better-sqlite3`/`@libsql/client` si no lo es.

## Notas de diseño para hardware de bajos recursos

- **Driver de SQLite (`node:sqlite`):** se eligió el módulo nativo de Node en vez de `better-sqlite3` para que `npm install` no dependa de compilar un addon C++ (esto resolvió un bloqueo real instalando en Windows sin Python/Visual Studio Build Tools). Es síncrono y no requiere un proceso aparte, igual que `better-sqlite3`. **Punto a revisar antes de producción:** si el Mini PC/RPi/TV Box de destino corre una versión de Node anterior a la 22.5 (por ejemplo, una imagen de Raspberry Pi OS con un Node LTS más viejo preinstalado), este driver no estará disponible y habrá que volver a un driver con binarios nativos precompilados para ARM (`better-sqlite3` o `@libsql/client` son las alternativas más sólidas — ambas publican prebuilds para `linux-arm64`/`linux-armv7`, así que tampoco deberían requerir compilar en el propio Raspberry Pi).
- Kysely no trae motor nativo propio (a diferencia de Prisma), lo que evita problemas de compilación cruzada en ARM sea cual sea el driver elegido.
- Tailwind se compila una sola vez a un CSS estático minificado: no hay build step en producción ni dependencia de un CDN.
- El worker de sincronización solo corre en la ventana de bajo tráfico configurada y respeta `SYNC_MAX_DESCARGAS_POR_CICLO` para no saturar el enlace de respaldo (4G/IoT).
