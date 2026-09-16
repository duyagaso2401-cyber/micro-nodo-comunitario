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
const secciones = ['pins', 'sync', 'contenidos', 'anuncios', 'cuenta'];
document.querySelectorAll('[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    secciones.forEach((s) => document.getElementById(`panel-${s}`).classList.toggle('hidden', s !== btn.dataset.tab));
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('tab-admin-activa', b === btn);
      b.classList.toggle('tab-admin-inactiva', b !== btn);
    });
    if (btn.dataset.tab === 'sync') cargarSincronizacion();
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
      <td class="max-w-xs truncate">${r.detalle || '—'}</td>
      <td>${r.registros_procesados}</td>
      <td>${formatearFecha(r.creado_en)}</td>
    </tr>`
    )
    .join('');
}

// --- Contenidos (carga manual) ---
async function cargarCategoriasSelect() {
  const respuesta = await fetch('/api/categorias');
  const datos = await respuesta.json();
  if (!datos.ok) return;
  const select = document.getElementById('select-categoria');
  select.innerHTML = datos.categorias.map((c) => `<option value="${c.slug}">${c.nombre}</option>`).join('');
}

document.getElementById('form-subir-contenido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const resultado = document.getElementById('resultado-subir-contenido');

  const respuesta = await fetch('/api/admin/contenidos', { method: 'POST', body: formData });
  const datos = await respuesta.json();

  resultado.classList.remove('hidden');
  if (respuesta.status === 401) return (window.location.href = '/admin/login');

  if (!datos.ok) {
    resultado.className = 'text-center text-sm font-medium text-rose-600';
    resultado.textContent = datos.mensaje || `No se pudo subir el contenido (${datos.error}).`;
  } else {
    resultado.className = 'text-center text-sm font-medium text-nodo-700';
    resultado.textContent = `Contenido cargado con id ${datos.contenidoId}.`;
    e.target.reset();
  }
});

// --- Publicidad ---
async function cargarAnuncios() {
  const { datos } = await apiFetch('/api/admin/anuncios');
  if (!datos.ok) return;

  const cuerpo = document.getElementById('tabla-anuncios');
  cuerpo.innerHTML = datos.anuncios
    .map(
      (a) => `
    <tr>
      <td>${a.titulo}</td>
      <td>${a.impresiones_actuales} / ${a.impresiones_max || '∞'}</td>
      <td><span class="insignia-estado ${a.activo ? 'bg-nodo-100 text-nodo-700' : 'bg-slate-100 text-slate-500'}">${a.activo ? 'activo' : 'pausado'}</span></td>
      <td class="space-x-2">
        <button data-alternar="${a.id}" class="text-xs font-semibold text-nodo-700">${a.activo ? 'Pausar' : 'Activar'}</button>
        <button data-eliminar="${a.id}" class="text-xs font-semibold text-rose-600">Eliminar</button>
      </td>
    </tr>`
    )
    .join('');

  cuerpo.querySelectorAll('[data-alternar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await apiFetch(`/api/admin/anuncios/${btn.dataset.alternar}/alternar`, { method: 'PATCH' });
      cargarAnuncios();
    });
  });
  cuerpo.querySelectorAll('[data-eliminar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await apiFetch(`/api/admin/anuncios/${btn.dataset.eliminar}`, { method: 'DELETE' });
      cargarAnuncios();
    });
  });
}

document.getElementById('form-crear-anuncio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const respuesta = await fetch('/api/admin/anuncios', { method: 'POST', body: formData });
  const datos = await respuesta.json();
  if (respuesta.status === 401) return (window.location.href = '/admin/login');
  if (datos.ok) {
    e.target.reset();
    cargarAnuncios();
  }
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
