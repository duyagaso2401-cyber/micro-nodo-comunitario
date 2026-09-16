# Micro-Nodo Comunitario — Fase 1 + Fase 2

Plataforma web local *offline-first* para desplegar en micro-servidores de bajo
consumo (Mini PC / Raspberry Pi / TV Box con Linux), pensada para prestar
contenido educativo, biblioteca digital y servicios de descarga a comunidades
con conectividad inestable — con sincronización autónoma nocturna y un modelo
de monetización simple basado en PINs.

- **Fase 1** (base): backend Express, esquema SQLite, worker de sincronización
  de contenido (Gutendex), endpoint de PIN/cobro y portal cautivo.
- **Fase 2** (esta entrega): conexión a un backend central PostgreSQL
  (Neon/Supabase) con sincronización de transacciones en lotes, telemetría
  (heartbeat), panel de administración `/admin` con autenticación por sesión,
  y un módulo de publicidad local.

Todo lo de Fase 2 es **opcional y aditivo**: si no configuras
`CENTRAL_DATABASE_URL`, el nodo sigue operando 100% offline exactamente igual
que en Fase 1 (solo que sin sincronizar nada hacia la nube ni enviar
telemetría). Ningún flujo de negocio local depende de que la central esté
disponible.

## Stack técnico

- **Backend:** Node.js (>= 22.5) + Express
- **Base de datos local:** SQLite vía el módulo nativo **`node:sqlite`** (incluido en Node, cero dependencias npm ni compilación C++) con **Kysely** como query builder tipado — ver [`src/config/nodeSqliteAdapter.js`](./src/config/nodeSqliteAdapter.js)
- **Base de datos central (Fase 2):** PostgreSQL (Neon/Supabase) vía **Kysely + `pg`** — ver [`src/config/centralDatabase.js`](./src/config/centralDatabase.js)
- **Autenticación admin (Fase 2):** sesión con cookie (`express-session`) + hash de contraseña con **`bcryptjs`** (igual que `node:sqlite`, es una implementación 100% JS, sin addon nativo que compilar)
- **Carga de archivos (Fase 2):** `multer` (subida manual de contenido y de imágenes de anuncios)
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
│   ├── server.js                  # Bootstrap de Express (sesión, rutas, workers)
│   ├── config/
│   │   ├── env.js                 # Lectura centralizada de variables de entorno
│   │   ├── database.js            # Conexión Kysely + node:sqlite (local)
│   │   ├── nodeSqliteAdapter.js    # Adaptador node:sqlite -> interfaz SqliteDialect de Kysely
│   │   └── centralDatabase.js      # Conexión Kysely + pg (central, opcional)
│   ├── db/
│   │   ├── schema.sql             # DDL local: contenidos, pins_acceso, transacciones, anuncios, admins, log_sincronizacion...
│   │   ├── centralSchema.sql       # DDL central (Postgres): nodos, transacciones_centrales, heartbeats
│   │   ├── types.js / centralTypes.js  # Tipos JSDoc para los generics de Kysely
│   │   └── migrate.js             # Aplica schema.sql + migraciones incrementales + siembra (categorías, admin inicial)
│   ├── repositories/              # Acceso a datos (una función por consulta), incluye repositories/centralRepository.js
│   ├── services/
│   │   ├── pinService.js          # Reglas de negocio de PIN / monetización
│   │   ├── authService.js          # Hash/verificación de contraseñas (bcryptjs)
│   │   └── telemetryService.js     # Heartbeat periódico hacia la central
│   ├── controllers/                # Traducen HTTP <-> servicios/repositorios
│   ├── routes/                    # catalogo, pin, nodo, admin, anuncios
│   ├── middlewares/
│   │   ├── requireAdminAuth.js     # Sesión O x-admin-key
│   │   └── uploads.js              # multer: contenido manual + imágenes de anuncios
│   ├── workers/
│   │   ├── syncWorker.js          # Sincronización de contenido (Gutendex) — Fase 1
│   │   ├── centralSyncWorker.js    # Sincronización de transacciones -> central — Fase 2
│   │   ├── diskManager.js         # Rotación de caché / límite de disco
│   │   └── sources/gutendexSource.js
│   ├── styles/input.css           # Entrada de Tailwind (incluye componentes del panel admin)
│   └── utils/
├── public/                        # Portal cautivo + panel admin (servidos como estático)
│   ├── index.html / js/app.js      # Portal cautivo (catálogo, PIN, anuncio de 5s)
│   ├── admin/                     # Panel /admin (login.html, index.html, js/)
│   ├── uploads/anuncios/           # Imágenes de anuncios subidas desde el panel (gitignored)
│   └── css/output.css             # Generado por `npm run css:build`
├── data/                          # DB local + archivos descargados (gitignored)
└── scripts/
    ├── seed.js                    # Datos de ejemplo opcionales (Fase 1)
    └── migrateCentral.js           # Aplica centralSchema.sql sobre CENTRAL_DATABASE_URL (manual)
```

## Puesta en marcha

> **Requisito de versión:** Node.js **>= 22.5** (recomendado: Node 24 LTS).
> El proyecto usa el módulo nativo `node:sqlite` como driver local, así que
> `npm install` **no compila nada en C++** ni necesita Python / Visual Studio
> Build Tools — ideal para Windows. Todas las dependencias nuevas de Fase 2
> (`pg`, `bcryptjs`, `express-session`, `multer`) también son JavaScript puro,
> por la misma razón. Verifica tu versión con `node --version`.

```bash
cp .env.example .env               # ajustar valores del nodo (ver variables Fase 2 más abajo)
npm install                        # instala dependencias y corre la migración local (postinstall)
npm run css:build                  # compila Tailwind -> public/css/output.css
npm start                          # arranca el servidor en http://localhost:3000
```

Si vas a usar el backend central (opcional), además:

```bash
# 1. Define CENTRAL_DATABASE_URL en .env con tu cadena de conexión de Neon/Supabase
# 2. Aplica el esquema central UNA VEZ (no se aplica automáticamente al arrancar):
npm run db:migrate:central
```

Primer ingreso al panel: abre `http://localhost:3000/admin` y entra con
`ADMIN_USUARIO` / `ADMIN_PASSWORD_INICIAL` (por defecto `admin` /
`cambiar123` — **cámbiala** desde la pestaña "Mi cuenta" del panel apenas
entres).

Scripts disponibles (`package.json`):

| Script                    | Qué hace                                                                 |
|---------------------------|---------------------------------------------------------------------------|
| `npm start`               | Arranca el servidor Express + los 3 programadores (sync, sync central, telemetría) |
| `npm run dev`              | Igual que `start`, con recarga automática (`node --watch`)               |
| `npm run db:migrate`       | Aplica el esquema local + migraciones incrementales + siembra (idempotente) |
| `npm run db:migrate:central` | Aplica `centralSchema.sql` sobre `CENTRAL_DATABASE_URL` (manual, una vez) |
| `npm run sync`             | Ejecuta el worker de sincronización de contenido una sola vez             |
| `npm run sync:central`     | Ejecuta el envío de transacciones pendientes hacia la central una sola vez |
| `npm run heartbeat`        | Envía un heartbeat de telemetría de inmediato, sin esperar el cron        |
| `npm run build`            | Alias de `css:build`, pensado para el "Build Command" de un PaaS (Render, etc.) |
| `npm run css:build`        | Compila Tailwind a `public/css/output.css` (minificado)                  |
| `npm run css:watch`        | Recompila Tailwind en modo watch durante desarrollo                       |

`npm install` ya deja el nodo listo para arrancar por sí solo: el hook
`postinstall` corre `db:migrate` y `css:build` en cadena, así que incluso si
tu plataforma de despliegue solo ejecuta `npm install` (sin un "Build
Command" propio), el CSS de Tailwind y la base de datos quedan preparados
igual.

## Despliegue en Render (opcional)

El proyecto también corre como un servicio web normal en Render (o
cualquier PaaS similar), útil por ejemplo para exponer el backend central
de administración o para probar el panel `/admin` sin el hardware físico.
El uso principal sigue siendo el Mini PC/Raspberry Pi local — esta sección
es solo para quien además quiera una instancia en la nube.

**Configuración del servicio en Render:**

- **Build Command:** `npm install` (alcanza por sí solo gracias al `postinstall`; si prefieres ser explícito, `npm install && npm run build` funciona igual).
- **Start Command:** `npm start`
- **Node version:** el proyecto fija `engines.node: ">=22.5.0"` en `package.json` — confírmalo en la configuración de Render si no detecta la versión automáticamente.

**Variables de entorno a agregar en la pestaña "Environment" de Render**
(además de las `NODE_ENV`/`PORT` que ya tienes), usando los **nombres
exactos** que lee `src/config/env.js` — variables con otro nombre
simplemente se ignoran en silencio:

*Imprescindibles para que el panel `/admin` sea seguro en producción:*

| Variable | Para qué | Ejemplo |
|---|---|---|
| `SESSION_SECRET` | Firma la cookie de sesión del panel admin | una cadena larga y aleatoria (no el valor de ejemplo del repo) |
| `ADMIN_PASSWORD_INICIAL` | Contraseña del admin creado en el primer `db:migrate` | reemplaza el `cambiar123` por defecto |
| `COOKIE_SEGURA` | `true` para que la cookie de sesión exija HTTPS (Render sirve todo detrás de TLS) | `true` |

*Necesarias si vas a usar el backend central (Neon/Supabase) y la telemetría:*

| Variable | Para qué | Ejemplo |
|---|---|---|
| `CENTRAL_DATABASE_URL` | Cadena de conexión Postgres de Neon/Supabase | `postgresql://usuario:pass@host/db?sslmode=require` |
| `NODO_ID` | Identifica este nodo en la tabla `nodos` de la central | `nodo-render-admin` |

Con solo esas dos ya alcanza: `CENTRAL_SYNC_HABILITADO` y
`TELEMETRY_HABILITADO` ya son `true` por defecto en el código. Después de
desplegar, corre **una sola vez** `npm run db:migrate:central` (desde tu
máquina, apuntando `CENTRAL_DATABASE_URL` a la misma base) para crear las
tablas `nodos`/`transacciones_centrales`/`heartbeats` — Render no lo hace
por ti automáticamente.

*Nombres que NO existen en el código (por si los tenías anotados de otra
fuente) — no configures estos, no tienen efecto:* ~~`NODE_ID`~~ (es
`NODO_ID`), ~~`ADMIN_SECRET`~~ (es `SESSION_SECRET` para el panel, o
`ADMIN_API_KEY` para el header heredado de Fase 1 — son dos cosas
distintas).

*El resto de las variables de Fase 1/Fase 2 (`NODO_NOMBRE`, `PIN_*`,
`SYNC_*`, `DISCO_*`, etc.) tienen valores por defecto razonables — solo
hace falta tocarlas si quieres cambiar ese comportamiento. Ver
`.env.example` para la lista completa con explicación de cada una.*

> **Disco efímero:** sin un [Persistent
> Disk](https://render.com/docs/disks) adjunto al servicio, la base de
> datos SQLite, los contenidos descargados y las imágenes de anuncios
> subidas se pierden en cada redeploy/reinicio — Render no conserva el
> filesystem del contenedor entre despliegues. Si te importa que esos
> datos sobrevivan, agrega un disco persistente (por ejemplo montado en
> `/var/data`) y apunta `DB_PATH`, `DOWNLOADS_PATH` y
> `UPLOADS_ANUNCIOS_PATH` dentro de él.

## Esquema de base de datos local (SQLite)

- **`categorias`** — agrupan el catálogo (Repositorio Educativo, Biblioteca Digital, Manuales Técnicos, Guías de Estudio, Formularios e Información Local).
- **`contenidos`** — cada archivo indexado: tipo, tamaño, hash, ruta en disco, si es premium, contadores de consulta/descarga y `prioridad_cache` (usada por la rotación automática).
- **`pins_acceso`** — tokens de acceso a descargas premium: código, valor en COP, comisión del local, estado (`disponible` / `usado` / `anulado` / `expirado`).
- **`transacciones`** — todo movimiento económico (venta de PIN, descarga premium, publicidad) con monto, comisión, método de pago y **`sincronizado_central`/`fecha_sincronizado_central`** (Fase 2, agregadas por migración incremental).
- **`registro_descargas`** *(Fase 2)* — un evento por descarga servida (gratis o premium), necesario para poder responder "¿cuántas descargas hubo hoy?" (un contador acumulado no puede).
- **`nodo_config`** — configuración clave-valor persistida (identidad del nodo, última sincronización, etc.).
- **`admins`** *(Fase 2)* — usuarios del panel `/admin` (contraseña con hash bcrypt).
- **`log_sincronizacion`** *(Fase 2)* — historial de corridas de los 3 workers en segundo plano, visible en el panel.
- **`anuncios`** *(Fase 2)* — publicidad local: título, imagen, link, tope de impresiones.

Ver el detalle completo en [`src/db/schema.sql`](./src/db/schema.sql). Las
tablas de Fase 2 se crean con `CREATE TABLE IF NOT EXISTS`, y las columnas
nuevas sobre `transacciones` se agregan con `ALTER TABLE` + introspección
(`src/db/migrate.js`) — correr `npm run db:migrate` sobre una base de datos
de Fase 1 ya en uso es seguro, no borra ni pisa datos existentes.

## Esquema de base de datos central (PostgreSQL, opcional)

- **`nodos`** — un registro por nodo comunitario desplegado (id = `NODO_ID`).
- **`transacciones_centrales`** — espejo de las transacciones locales sincronizadas, con `UNIQUE (nodo_id, transaccion_local_id)`: reintentar el mismo lote nunca duplica filas.
- **`heartbeats`** — historial de telemetría de cada nodo (disco, uptime, estadísticas del día).
- **`nodos_estado_actual`** — vista de conveniencia con el último heartbeat de cada nodo, pensada para un futuro dashboard central.

Ver [`src/db/centralSchema.sql`](./src/db/centralSchema.sql). Se aplica manualmente con `npm run db:migrate:central`, nunca automáticamente.

## Worker de sincronización de contenido (Fase 1)

`src/workers/syncWorker.js` corre por defecto a las **2:00 AM** (configurable
vía `SYNC_CRON_EXPRESION`) y:

1. Consulta la API pública de Gutendex (libros en español, ordenados por popularidad).
2. Descarga los formatos disponibles (prioriza EPUB, luego PDF, luego texto plano).
3. Calcula el hash SHA-256 de cada archivo para evitar duplicados y omite lo ya indexado (por URL de origen o por hash).
4. Inserta metadatos en `contenidos`, bajo la categoría "Biblioteca Digital".
5. Ejecuta `diskManager.liberarEspacioSiNecesario()`: si el uso de disco supera `DISCO_UMBRAL_LIMPIEZA_PCT` de `DISCO_LIMITE_MB`, elimina automáticamente los contenidos sincronizados de menor prioridad/demanda (nunca toca contenido subido manualmente).

Para probarlo sin esperar al cron: `npm run sync`.

## Backend central y sincronización de transacciones (Fase 2)

`src/config/centralDatabase.js` monta un cliente Kysely+`pg` hacia
`CENTRAL_DATABASE_URL` (Neon/Supabase). Es **completamente opcional**: si la
variable está vacía, `db` queda en `null` y todo el código que la usa
comprueba `estaDisponible()` antes de intentar nada — el nodo sigue
funcionando 100% offline.

`src/workers/centralSyncWorker.js` toma en lotes (`CENTRAL_SYNC_LOTE_MAX`,
50 por defecto) las filas de `transacciones` con `sincronizado_central = 0`
y las envía a `transacciones_centrales` con un `INSERT ... ON CONFLICT DO
NOTHING` (idempotente: reintentar un lote ya recibido no duplica nada). Se
dispara de dos formas:

1. **Periódicamente**, vía `node-cron` (`CENTRAL_SYNC_CRON_EXPRESION`, cada 10 min por defecto).
2. **En segundo plano justo después de validar un PIN** (`pinService.js` llama a `centralSyncWorker.sincronizarEnSegundoPlano()`), para reflejar el ingreso casi en tiempo real cuando hay conexión, sin bloquear la respuesta al cliente.

Si la central está caída o no hay enlace de respaldo (4G/IoT), el envío
falla en silencio (se registra en `log_sincronizacion`) y las transacciones
quedan pendientes para el siguiente ciclo — nunca se pierden.

## Telemetría (heartbeat)

`src/services/telemetryService.js` arma cada `TELEMETRY_INTERVALO_MIN`
minutos (5 por defecto) un heartbeat con: `NODO_ID`, disco usado/límite,
tiempo activo del proceso, descargas de hoy, PINs consumidos hoy, recaudado
hoy (COP) y contenidos activos — y lo inserta en la tabla `heartbeats` de la
central.

> **Nota de diseño:** el enunciado original hablaba de "WebSocket o llamadas
> HTTP heartbeat a un backend de administración central". Como Fase 2 ya
> monta una conexión directa a Postgres central para las transacciones, la
> telemetría reutiliza esa misma conexión (un `INSERT`) en vez de levantar
> un servicio HTTP central aparte — es la opción más simple que cumple el
> mismo objetivo. Si más adelante se construye un backend de administración
> con su propia API HTTP/WebSocket, `telemetryService.js` es el único lugar
> que habría que tocar.

Para probarlo sin esperar al cron: `npm run heartbeat`.

## Panel de administración `/admin` (Fase 2)

Interfaz web ligera (Tailwind, sin build de JS) en `/admin`, con login en
`/admin/login`. Autenticación por **sesión con cookie** (`express-session` +
contraseña con hash `bcryptjs`); el header `x-admin-key` de Fase 1 se
mantiene como alternativa por retrocompatibilidad (scripts/POS), ver
`src/middlewares/requireAdminAuth.js`.

Secciones del panel:

- **PINs** — tabla de PINs (filtrable por disponible/usado) y formulario para generar nuevos lotes.
- **Sincronización** — historial de las últimas corridas de los 3 workers (contenido, transacciones central, heartbeat), con estado y detalle de error si lo hubo.
- **Contenidos** — carga manual de un archivo (PDF/EPUB/MP3/video/doc) para emergencias sin internet, con categoría, tipo y si es premium.
- **Publicidad** — alta/baja/eliminación de anuncios locales (ver siguiente sección).
- **Mi cuenta** — cambiar la contraseña del admin actual.

El primer administrador se crea automáticamente en `npm run db:migrate` (o
en el `postinstall` de `npm install`) usando `ADMIN_USUARIO` /
`ADMIN_PASSWORD_INICIAL`, solo si la tabla `admins` está vacía — así que no
pisa una contraseña que ya hayas cambiado desde el panel.

> **Nota de diseño:** la sesión usa el `MemoryStore` por defecto de
> `express-session` (no Redis ni nada externo). Es una elección deliberada:
> el nodo corre como un único proceso Node en el propio Mini PC/RPi, así
> que no hace falta un store compartido — perder la sesión al reiniciar el
> proceso solo implica volver a loguearse.

## Publicidad local (Fase 2)

Tabla `anuncios` (`titulo`, `imagen_url`, `link`, `impresiones_max`,
`impresiones_actuales`, `activo`). El operador del nodo los gestiona desde
`/admin` → pestaña Publicidad (sube una imagen o pega una URL externa).

En el portal público, antes de una descarga de contenido **gratuito**
(decisión de diseño: el contenido premium ya generó ingreso vía PIN, así
que no se le agrega fricción publicitaria extra), `public/js/app.js`
consulta `GET /api/anuncios/siguiente`:

- Si hay un anuncio activo con cupo, se muestra un modal de 5 segundos
  (`ANUNCIO_DURACION_SEGUNDOS`) con cuenta regresiva que **avanza
  automáticamente** a la descarga al terminar (sin botón "saltar", para no
  agregar un paso de interacción extra a usuarios con poca experiencia
  digital) y registra la impresión (`POST /api/anuncios/:id/impresion`).
- Si no hay ningún anuncio configurado (o falla la consulta), la descarga
  sigue de largo sin bloquear al usuario — la publicidad nunca es un
  obstáculo para acceder al contenido.

## Monetización: PIN y cobro

- `POST /api/pins/generar` *(sesión de admin o header `x-admin-key`)* — genera uno o varios PINs (`cantidad`, `valorCop`, `comisionLocalPct`, `contenidoId` opcional para atarlo a un recurso específico). También disponible como `POST /api/admin/pins/generar` desde el panel.
- `POST /api/pins/validar` *(público)* — el portal cautivo envía `{ codigo, contenidoId }`; si el PIN es válido lo marca como `usado`, registra la transacción (monto + comisión), intenta sincronizarla con la central en segundo plano y devuelve una `descargaUrl` firmada, válida por 5 minutos.
- `GET /api/contenidos/:id/descargar?token=...` — sirve el archivo. Para contenido premium exige el token emitido por `/api/pins/validar`; para contenido gratuito no requiere token (pero puede pasar primero por el modal de publicidad, ver arriba).
- `GET /api/pins/estado/:codigo` *(sesión de admin o `x-admin-key`)* — consulta el estado de un PIN sin consumirlo.

El cobro real por QR (Nequi/Daviplata/Wompi) sigue quedando como módulo a
integrar en una fase futura, sobre esta misma tabla `transacciones` y el
mismo flujo de `descargaUrl` firmada.

## Portal cautivo (frontend)

`public/index.html` + `public/js/app.js`: catálogo mobile-first con buscador,
filtro por categoría, tarjetas de contenido (con insignia "Gratis" / "🔒
Premium"), modal de PIN para contenido premium, y modal de anuncio de 5s
antes de una descarga gratuita. Sin frameworks de frontend ni CDN externos —
todo se sirve desde el propio nodo, incluido el CSS de Tailwind ya
compilado.

## Próximos pasos (fuera de este alcance)

- Integración real de QR dinámico (Wompi/Nequi/Daviplata) sobre el mismo flujo de `transacciones`.
- Dashboard central (web) sobre `nodos_estado_actual` / `heartbeats` / `transacciones_centrales`, para ver todos los nodos desplegados a la vez.
- Portal cautivo real a nivel de red (redirección DNS/HTTP del router hacia este servidor).
- Roles de administrador (hoy todos los usuarios de `admins` tienen el mismo nivel de acceso).
- Rotar o expirar automáticamente la sesión del panel tras inactividad prolongada (hoy solo expira por `SESSION_MAX_EDAD_HORAS`).
- **Revisar el driver de base de datos local para producción en Raspberry Pi/TV Box** (ver nota abajo): confirmar que el Node instalado en el hardware final sea >= 22.5, o volver a `better-sqlite3`/`@libsql/client` si no lo es.

## Notas de diseño para hardware de bajos recursos

- **Driver de SQLite (`node:sqlite`):** se eligió el módulo nativo de Node en vez de `better-sqlite3` para que `npm install` no dependa de compilar un addon C++ (esto resolvió un bloqueo real instalando en Windows sin Python/Visual Studio Build Tools). Es síncrono y no requiere un proceso aparte, igual que `better-sqlite3`. **Punto a revisar antes de producción:** si el Mini PC/RPi/TV Box de destino corre una versión de Node anterior a la 22.5 (por ejemplo, una imagen de Raspberry Pi OS con un Node LTS más viejo preinstalado), este driver no estará disponible y habrá que volver a un driver con binarios nativos precompilados para ARM (`better-sqlite3` o `@libsql/client` son las alternativas más sólidas — ambas publican prebuilds para `linux-arm64`/`linux-armv7`, así que tampoco deberían requerir compilar en el propio Raspberry Pi).
- **Dependencias de Fase 2 también en JS puro:** `pg` (protocolo Postgres implementado en JS, sin addon nativo), `bcryptjs` (a diferencia de `bcrypt`, que sí requiere compilar) y `multer` no agregan ningún requisito de compilación nueva sobre lo ya resuelto en Fase 1.
- Kysely no trae motor nativo propio (a diferencia de Prisma), lo que evita problemas de compilación cruzada en ARM sea cual sea el driver elegido.
- Tailwind se compila una sola vez a un CSS estático minificado: no hay build step en producción ni dependencia de un CDN.
- El worker de sincronización de contenido solo corre en la ventana de bajo tráfico configurada y respeta `SYNC_MAX_DESCARGAS_POR_CICLO` para no saturar el enlace de respaldo (4G/IoT). Los workers de Fase 2 (sync central, telemetría) mandan payloads muy pequeños (unos pocos KB por ciclo), así que su impacto en el enlace de respaldo es marginal en comparación.
- La sesión del panel admin usa `MemoryStore` en memoria (ver sección del panel arriba): cero dependencias adicionales, apropiado para un único proceso Node en hardware modesto.
