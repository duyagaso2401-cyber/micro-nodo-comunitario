'use strict';

const estado = { filtroPin: '' };

async function apiFetch(url, opciones) {
  const respuesta = await fetch(url, opciones);
  if (respuesta.status === 401) {
    window.location.href = '/admin/login';
    throw new Error('sin_sesion');
  }
  const datos = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, datos };
}

function formatearFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Sesión / cabecera ---
async function cargarSesionYEstadisticas() {
  const { datos: sesion } = await apiFetch('/api/admin/me');
  if (!sesion.ok) return;

  const { datos } = await apiFetch('/api/admin/estadisticas');
  if (!datos.ok) return;

  document.getElementById('nombre-nodo').textContent = `${datos.nodo.nombre} (${sesion.admin.usuario})`;
  document.getElementById('stat-disco').textContent = `${datos.almacenamiento.usadoMB} / ${datos.almacenamiento.limiteMB}`;
  document.getElementById('stat-descargas').textContent = datos.hoy.descargas;
  document.getElementById('stat-pines').textContent = datos.hoy.pinsConsumidos;
  document.getElementById('stat-recaudo').textContent = `$${datos.hoy.recaudadoCop.toLocaleString('es-CO')}`;

  const indicadorCentral = document.getElementById('indicador-central');
  indicadorCentral.textContent = datos.central.conectada ? '● Central conectada' : '○ Sin backend central';
  indicadorCentral.classList.remove('hidden');
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/admin/login';
});

// --- Pestañas ---
const secciones = ['pins', 'sync', 'contenidos', 'categorias', 'anuncios', 'cuenta'];
document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    secciones.forEach((s) => document.getElementById(`panel-${s}`).classList.toggle('hidden', s !== btn.dataset.tab));
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('tab-admin-activa', b === btn);
      b.classList.toggle('tab-admin-inactiva', b !== btn);
    });
    if (btn.dataset.tab === 'sync') cargarSincronizacion();
    if (btn.dataset.tab === 'contenidos') cargarContenidos();
    if (btn.dataset.tab === 'categorias') cargarCategorias();
    if (btn.dataset.tab === 'anuncios') cargarAnuncios();
  });
});

// --- PINs ---
async function cargarPins() {
  const params = new URLSearchParams();
  if (estado.filtroPin) params.set('estado', estado.filtroPin);
  const { datos } = await apiFetch(`/api/admin/pins?${params.toString()}`);
  if (!datos.ok) return;

  const cuerpo = document.getElementById('tabla-pins');
  cuerpo.innerHTML = datos.pins
    .map(
      (p) => `
    <tr>
      <td class="font-mono font-semibold">${p.codigo}</td>
      <td><span class="insignia-estado ${p.estado === 'disponible' ? 'bg-nodo-100 text-nodo-700' : 'bg-slate-100 text-slate-500'}">${p.estado}</span></td>
      <td>$${p.valor_cop.toLocaleString('es-CO')}</td>
      <td>${formatearFecha(p.fecha_creacion)}</td>
      <td>${formatearFecha(p.fecha_uso)}</td>
    </tr>`
    )
    .join('');
}

document.querySelectorAll('[data-filtro-pin]').forEach((btn) => {
  btn.addEventListener('click', () => {
    estado.filtroPin = btn.dataset.filtroPin;
    document.querySelectorAll('[data-filtro-pin]').forEach((b) => {
      b.classList.toggle('pill-categoria-activa', b === btn);
      b.classList.toggle('pill-categoria-inactiva', b !== btn);
    });
    cargarPins();
  });
});

document.getElementById('form-generar-pins').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = {
    cantidad: Number(form.get('cantidad')),
    valorCop: form.get('valorCop') ? Number(form.get('valorCop')) : undefined,
    comisionLocalPct: form.get('comisionLocalPct') ? Number(form.get('comisionLocalPct')) : undefined,
  };

  const { datos } = await apiFetch('/api/admin/pins/generar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const resultado = document.getElementById('resultado-generar-pins');
  resultado.classList.remove('hidden');
  if (!datos.ok) {
    resultado.textContent = 'No se pudieron generar los PINs.';
  } else {
    resultado.textContent = `Generados: ${datos.pins.map((p) => p.codigo).join(', ')}`;
    cargarPins();
  }
});

// --- Sincronización ---
async function cargarSincronizacion() {
  const { datos } = await apiFetch('/api/admin/sincronizacion');
  if (!datos.ok) return;

  const cuerpo = document.getElementById('tabla-sync');
  cuerpo.innerHTML = datos.registros
    .map(
      (r) => `
    <tr>
      <td>${r.tipo}</td>
      <td><span class="insignia-estado ${r.estado === 'exito' ? 'bg-nodo-100 text-nodo-700' : r.estado === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}">${r.estado}</span></td>
      <td class="max-w-xs truncate">${escaparHtml(r.detalle) || '—'}</td>
      <td>${r.registros_procesados}</td>
      <td>${formatearFecha(r.creado_en)}</td>
    </tr>`
    )
    .join('');
}

// --- Contenidos ---
async function cargarCategoriasSelect() {
  const respuesta = await fetch('/api/categorias');
  const datos = await respuesta.json();
  if (!datos.ok) return;
  const select = document.getElementById('select-categoria');
  const valorPrevio = select.value;
  select.innerHTML =
    '<option value="">Sin categoría</option>' + datos.categorias.map((c) => `<option value="${c.slug}">${escaparHtml(c.nombre)}</option>`).join('');
  if (valorPrevio) select.value = valorPrevio;
}

const formContenido = document.getElementById('form-contenido');
const inputContenidoId = document.getElementById('contenido-id');
const inputContenidoArchivo = document.getElementById('contenido-archivo');
const btnGuardarContenido = document.getElementById('btn-guardar-contenido');
const btnCancelarEdicionContenido = document.getElementById('btn-cancelar-edicion-contenido');
const tituloFormContenido = document.getElementById('titulo-form-contenido');
const etiquetaArchivoContenido = document.getElementById('etiqueta-archivo-contenido');
const ayudaArchivoContenido = document.getElementById('ayuda-archivo-contenido');

function iniciarEdicionContenido(item) {
  inputContenidoId.value = item.id;
  formContenido.titulo.value = item.titulo || '';
  formContenido.autor.value = item.autor || '';
  formContenido.tipo.value = item.tipo;
  formContenido.descripcion.value = item.descripcion || '';
  formContenido.estado.value = item.estado === 'pendiente' ? 'pendiente' : 'activo';
  formContenido['esPremium'].checked = Boolean(item.es_premium);
  formContenido.categoriaSlug.value = item.categoria_slug || '';

  inputContenidoArchivo.removeAttribute('required');
  etiquetaArchivoContenido.textContent = 'Reemplazar archivo (opcional)';
  ayudaArchivoContenido.classList.remove('hidden');

  tituloFormContenido.textContent = `Editando: ${item.titulo}`;
  btnGuardarContenido.textContent = 'Guardar cambios';
  btnCancelarEdicionContenido.classList.remove('hidden');

  formContenido.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEdicionContenido() {
  formContenido.reset();
  inputContenidoId.value = '';
  inputContenidoArchivo.setAttribute('required', 'required');
  etiquetaArchivoContenido.textContent = 'Archivo *';
  ayudaArchivoContenido.classList.add('hidden');
  tituloFormContenido.textContent = 'Carga manual de emergencia (sin internet)';
  btnGuardarContenido.textContent = 'Subir contenido';
  btnCancelarEdicionContenido.classList.add('hidden');
  document.getElementById('resultado-subir-contenido').classList.add('hidden');
}

btnCancelarEdicionContenido.addEventListener('click', cancelarEdicionContenido);

async function cargarContenidos() {
  const { datos } = await apiFetch('/api/admin/contenidos?pageSize=200');
  if (!datos.ok) return;

  const cuerpo = document.getElementById('tabla-contenidos');
  cuerpo.innerHTML = datos.contenidos
    .map(
      (c) => `
    <tr>
      <td>${escaparHtml(c.titulo)}</td>
      <td>${c.tipo}</td>
      <td>${escaparHtml(c.categoria_nombre) || '—'}</td>
      <td><span class="insignia-estado ${c.estado === 'activo' ? 'bg-nodo-100 text-nodo-700' : 'bg-slate-100 text-slate-500'}">${c.estado === 'activo' ? 'Activo' : 'Inactivo'}</span></td>
      <td>${c.es_premium ? 'Sí' : 'No'}</td>
      <td class="space-x-2 whitespace-nowrap">
        <button data-editar-contenido="${c.id}" class="text-xs font-semibold text-nodo-700">Editar</button>
        <button data-eliminar-contenido="${c.id}" class="text-xs font-semibold text-rose-600">Eliminar</button>
      </td>
    </tr>`
    )
    .join('');

  cuerpo.querySelectorAll('[data-editar-contenido]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = datos.contenidos.find((c) => String(c.id) === btn.dataset.editarContenido);
      if (item) iniciarEdicionContenido(item);
    });
  });
  cuerpo.querySelectorAll('[data-eliminar-contenido]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = datos.contenidos.find((c) => String(c.id) === btn.dataset.eliminarContenido);
      if (!window.confirm(`¿Eliminar definitivamente "${item ? item.titulo : ''}"? Esto borra el registro y el archivo, y no se puede deshacer.`)) return;

      const { datos: resultado } = await apiFetch(`/api/admin/contenidos/${btn.dataset.eliminarContenido}`, { method: 'DELETE' });
      if (!resultado.ok) {
        window.alert(resultado.mensaje || 'No se pudo eliminar el contenido.');
        return;
      }
      if (inputContenidoId.value === btn.dataset.eliminarContenido) cancelarEdicionContenido();
      cargarContenidos();
    });
  });
}

formContenido.addEventListener('submit', async (e) => {
  e.preventDefault();
  const idEditando = inputContenidoId.value;
  const formData = new FormData(e.target);
  const resultado = document.getElementById('resultado-subir-contenido');

  const respuesta = await fetch(idEditando ? `/api/admin/contenidos/${idEditando}` : '/api/admin/contenidos', {
    method: idEditando ? 'PUT' : 'POST',
    body: formData,
  });
  const datos = await respuesta.json();

  resultado.classList.remove('hidden');
  if (respuesta.status === 401) return (window.location.href = '/admin/login');

  if (!datos.ok) {
    resultado.className = 'text-center text-sm font-medium text-rose-600';
    resultado.textContent = datos.mensaje || `No se pudo guardar el contenido (${datos.error}).`;
  } else {
    const mensaje = idEditando ? 'Contenido actualizado.' : `Contenido cargado con id ${datos.contenidoId}.`;
    cancelarEdicionContenido();
    resultado.className = 'text-center text-sm font-medium text-nodo-700';
    resultado.classList.remove('hidden');
    resultado.textContent = mensaje;
    cargarContenidos();
  }
});

// --- Categorías ---
const formCategoria = document.getElementById('form-categoria');
const inputCategoriaId = document.getElementById('categoria-id');
const btnGuardarCategoria = document.getElementById('btn-guardar-categoria');
const btnCancelarEdicionCategoria = document.getElementById('btn-cancelar-edicion-categoria');
const tituloFormCategoria = document.getElementById('titulo-form-categoria');

function iniciarEdicionCategoria(cat) {
  inputCategoriaId.value = cat.id;
  formCategoria.nombre.value = cat.nombre;
  formCategoria.icono.value = cat.icono || '';
  formCategoria.orden.value = cat.orden ?? 0;
  formCategoria.descripcion.value = cat.descripcion || '';

  tituloFormCategoria.textContent = `Editando: ${cat.nombre}`;
  btnGuardarCategoria.textContent = 'Guardar cambios';
  btnCancelarEdicionCategoria.classList.remove('hidden');
  formCategoria.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEdicionCategoria() {
  formCategoria.reset();
  inputCategoriaId.value = '';
  tituloFormCategoria.textContent = 'Nueva categoría';
  btnGuardarCategoria.textContent = 'Crear categoría';
  btnCancelarEdicionCategoria.classList.add('hidden');
  document.getElementById('resultado-categoria').classList.add('hidden');
}

btnCancelarEdicionCategoria.addEventListener('click', cancelarEdicionCategoria);

async function cargarCategorias() {
  const { datos } = await apiFetch('/api/admin/categorias');
  if (!datos.ok) return;

  const cuerpo = document.getElementById('tabla-categorias');
  cuerpo.innerHTML = datos.categorias
    .map(
      (c) => `
    <tr>
      <td>${escaparHtml(c.nombre)}</td>
      <td class="font-mono text-xs text-slate-500">${c.slug}</td>
      <td>${c.orden}</td>
      <td class="space-x-2 whitespace-nowrap">
        <button data-editar-categoria="${c.id}" class="text-xs font-semibold text-nodo-700">Editar</button>
        <button data-eliminar-categoria="${c.id}" class="text-xs font-semibold text-rose-600">Eliminar</button>
      </td>
    </tr>`
    )
    .join('');

  cuerpo.querySelectorAll('[data-editar-categoria]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = datos.categorias.find((c) => String(c.id) === btn.dataset.editarCategoria);
      if (cat) iniciarEdicionCategoria(cat);
    });
  });
  cuerpo.querySelectorAll('[data-eliminar-categoria]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cat = datos.categorias.find((c) => String(c.id) === btn.dataset.eliminarCategoria);
      if (!window.confirm(`¿Eliminar la categoría "${cat ? cat.nombre : ''}"? Los contenidos que la usan quedarán sin categoría.`)) return;

      const { datos: resultado } = await apiFetch(`/api/admin/categorias/${btn.dataset.eliminarCategoria}`, { method: 'DELETE' });
      if (!resultado.ok) {
        window.alert(resultado.mensaje || 'No se pudo eliminar la categoría.');
        return;
      }
      if (inputCategoriaId.value === btn.dataset.eliminarCategoria) cancelarEdicionCategoria();
      cargarCategorias();
      cargarCategoriasSelect();
    });
  });
}

formCategoria.addEventListener('submit', async (e) => {
  e.preventDefault();
  const idEditando = inputCategoriaId.value;
  const form = new FormData(e.target);
  const body = {
    nombre: form.get('nombre'),
    icono: form.get('icono') || undefined,
    orden: form.get('orden') || undefined,
    descripcion: form.get('descripcion') || undefined,
  };

  const { datos } = await apiFetch(idEditando ? `/api/admin/categorias/${idEditando}` : '/api/admin/categorias', {
    method: idEditando ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const resultado = document.getElementById('resultado-categoria');
  resultado.classList.remove('hidden');
  if (!datos.ok) {
    resultado.className = 'text-sm font-medium text-rose-600 sm:col-span-2';
    resultado.textContent = datos.mensaje || 'No se pudo guardar la categoría.';
  } else {
    const mensaje = idEditando ? 'Categoría actualizada.' : 'Categoría creada.';
    cancelarEdicionCategoria();
    resultado.className = 'text-sm font-medium text-nodo-700 sm:col-span-2';
    resultado.classList.remove('hidden');
    resultado.textContent = mensaje;
    cargarCategorias();
    cargarCategoriasSelect();
  }
});

// --- Publicidad ---
const formAnuncio = document.getElementById('form-anuncio');
const inputAnuncioId = document.getElementById('anuncio-id');
const inputAnuncioImagen = document.getElementById('anuncio-imagen');
const btnGuardarAnuncio = document.getElementById('btn-guardar-anuncio');
const btnCancelarEdicionAnuncio = document.getElementById('btn-cancelar-edicion-anuncio');
const tituloFormAnuncio = document.getElementById('titulo-form-anuncio');
const ayudaImagenAnuncio = document.getElementById('ayuda-imagen-anuncio');

function iniciarEdicionAnuncio(a) {
  inputAnuncioId.value = a.id;
  formAnuncio.titulo.value = a.titulo;
  formAnuncio.link.value = a.link || '';
  formAnuncio.impresionesMax.value = a.impresiones_max || 0;

  ayudaImagenAnuncio.classList.remove('hidden');
  tituloFormAnuncio.textContent = `Editando: ${a.titulo}`;
  btnGuardarAnuncio.textContent = 'Guardar cambios';
  btnCancelarEdicionAnuncio.classList.remove('hidden');
  formAnuncio.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelarEdicionAnuncio() {
  formAnuncio.reset();
  inputAnuncioId.value = '';
  ayudaImagenAnuncio.classList.add('hidden');
  tituloFormAnuncio.textContent = 'Nuevo anuncio';
  btnGuardarAnuncio.textContent = 'Crear anuncio';
  btnCancelarEdicionAnuncio.classList.add('hidden');
}

btnCancelarEdicionAnuncio.addEventListener('click', cancelarEdicionAnuncio);

async function cargarAnuncios() {
  const { datos } = await apiFetch('/api/admin/anuncios');
  if (!datos.ok) return;

  const cuerpo = document.getElementById('tabla-anuncios');
  cuerpo.innerHTML = datos.anuncios
    .map(
      (a) => `
    <tr>
      <td>${escaparHtml(a.titulo)}</td>
      <td>${a.impresiones_actuales} / ${a.impresiones_max || '∞'}</td>
      <td><span class="insignia-estado ${a.activo ? 'bg-nodo-100 text-nodo-700' : 'bg-slate-100 text-slate-500'}">${a.activo ? 'activo' : 'pausado'}</span></td>
      <td class="space-x-2 whitespace-nowrap">
        <button data-editar="${a.id}" class="text-xs font-semibold text-nodo-700">Editar</button>
        <button data-alternar="${a.id}" class="text-xs font-semibold text-nodo-700">${a.activo ? 'Pausar' : 'Activar'}</button>
        <button data-eliminar="${a.id}" class="text-xs font-semibold text-rose-600">Eliminar</button>
      </td>
    </tr>`
    )
    .join('');

  cuerpo.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = datos.anuncios.find((x) => String(x.id) === btn.dataset.editar);
      if (a) iniciarEdicionAnuncio(a);
    });
  });
  cuerpo.querySelectorAll('[data-alternar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await apiFetch(`/api/admin/anuncios/${btn.dataset.alternar}/alternar`, { method: 'PATCH' });
      cargarAnuncios();
    });
  });
  cuerpo.querySelectorAll('[data-eliminar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const a = datos.anuncios.find((x) => String(x.id) === btn.dataset.eliminar);
      if (!window.confirm(`¿Eliminar el anuncio "${a ? a.titulo : ''}"?`)) return;

      await apiFetch(`/api/admin/anuncios/${btn.dataset.eliminar}`, { method: 'DELETE' });
      if (inputAnuncioId.value === btn.dataset.eliminar) cancelarEdicionAnuncio();
      cargarAnuncios();
    });
  });
}

formAnuncio.addEventListener('submit', async (e) => {
  e.preventDefault();
  const idEditando = inputAnuncioId.value;
  const formData = new FormData(e.target);

  const respuesta = await fetch(idEditando ? `/api/admin/anuncios/${idEditando}` : '/api/admin/anuncios', {
    method: idEditando ? 'PUT' : 'POST',
    body: formData,
  });
  const datos = await respuesta.json();
  if (respuesta.status === 401) return (window.location.href = '/admin/login');
  if (!datos.ok) {
    window.alert(datos.mensaje || 'No se pudo guardar el anuncio.');
    return;
  }
  cancelarEdicionAnuncio();
  cargarAnuncios();
});

// --- Mi cuenta ---
document.getElementById('form-cambiar-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const { datos } = await apiFetch('/api/admin/cambiar-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      passwordActual: form.get('passwordActual'),
      passwordNueva: form.get('passwordNueva'),
    }),
  });

  const resultado = document.getElementById('resultado-password');
  resultado.classList.remove('hidden');
  if (datos.ok) {
    resultado.className = 'text-center text-sm font-medium text-nodo-700';
    resultado.textContent = 'Contraseña actualizada.';
    e.target.reset();
  } else {
    resultado.className = 'text-center text-sm font-medium text-rose-600';
    resultado.textContent = 'No se pudo actualizar (revisa la contraseña actual).';
  }
});

// --- Arranque ---
cargarSesionYEstadisticas();
cargarPins();
cargarCategoriasSelect();
