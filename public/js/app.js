'use strict';

/**
 * Frontend vanilla JS del portal cautivo. Sin frameworks ni build step
 * de JS (solo Tailwind se compila), para mantener el nodo liviano y
 * fácil de servir desde un Mini PC / Raspberry Pi de bajos recursos.
 */

const ICONOS_TIPO = {
  pdf: '📄',
  epub: '📚',
  mp3: '🎧',
  video: '🎬',
  doc: '📝',
  otro: '📦',
};

const MOTIVOS_PIN = {
  pin_no_encontrado: 'Ese PIN no existe. Verifica el código.',
  pin_ya_usado: 'Este PIN ya fue utilizado.',
  pin_anulado: 'Este PIN fue anulado.',
  pin_expirado: 'Este PIN ya expiró.',
  pin_no_valido_para_este_contenido: 'Este PIN no aplica para este contenido.',
  contenido_no_encontrado: 'El contenido ya no está disponible.',
  datos_incompletos: 'Ingresa el PIN antes de continuar.',
};

const estado = {
  categoriaActiva: '',
  busqueda: '',
  contenidoSeleccionado: null,
  temporizadorBusqueda: null,
};

const el = {
  nombreNodo: document.getElementById('nombre-nodo'),
  resumenNodo: document.getElementById('resumen-nodo'),
  listaCategorias: document.getElementById('lista-categorias'),
  campoBusqueda: document.getElementById('campo-busqueda'),
  grilla: document.getElementById('grilla-contenidos'),
  mensajeVacio: document.getElementById('mensaje-vacio'),
  toast: document.getElementById('toast'),
  modal: document.getElementById('modal-pin'),
  modalTitulo: document.getElementById('modal-titulo-contenido'),
  modalInput: document.getElementById('modal-input-pin'),
  modalError: document.getElementById('modal-error'),
  modalValidar: document.getElementById('modal-validar'),
  modalCancelar: document.getElementById('modal-cancelar'),
  modalCerrar: document.getElementById('modal-cerrar'),
};

function formatearTamano(bytes) {
  if (!bytes) return '—';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  return `${valor.toFixed(valor >= 10 || i === 0 ? 0 : 1)} ${unidades[i]}`;
}

function mostrarToast(mensaje) {
  el.toast.textContent = mensaje;
  el.toast.classList.remove('opacity-0', 'translate-y-4');
  clearTimeout(mostrarToast._timer);
  mostrarToast._timer = setTimeout(() => {
    el.toast.classList.add('opacity-0', 'translate-y-4');
  }, 3200);
}

async function apiFetch(url, opciones) {
  const respuesta = await fetch(url, opciones);
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok && respuesta.status !== 402) {
    throw Object.assign(new Error(datos.mensaje || 'Error de red'), { status: respuesta.status, datos });
  }
  return { status: respuesta.status, datos };
}

async function cargarEstadoNodo() {
  try {
    const { datos } = await apiFetch('/api/nodo/estado');
    el.nombreNodo.textContent = datos.nodo.nombre;
    el.resumenNodo.textContent = `📦 ${datos.catalogo.totalContenidos} recursos disponibles · 💾 ${datos.almacenamiento.usadoMB} MB usados de ${datos.almacenamiento.limiteMB} MB`;
    el.resumenNodo.classList.remove('hidden');
  } catch (err) {
    el.nombreNodo.textContent = 'Nodo Comunitario';
    console.error('No se pudo cargar el estado del nodo', err);
  }
}

async function cargarCategorias() {
  try {
    const { datos } = await apiFetch('/api/categorias');
    for (const categoria of datos.categorias) {
      const boton = document.createElement('button');
      boton.dataset.slug = categoria.slug;
      boton.dataset.pill = '';
      boton.className = 'pill-categoria pill-categoria-inactiva';
      boton.textContent = categoria.nombre;
      boton.addEventListener('click', () => seleccionarCategoria(categoria.slug, boton));
      el.listaCategorias.appendChild(boton);
    }
  } catch (err) {
    console.error('No se pudieron cargar las categorías', err);
  }
}

function seleccionarCategoria(slug, botonClic) {
  estado.categoriaActiva = slug;
  document.querySelectorAll('[data-pill]').forEach((btn) => {
    btn.classList.toggle('pill-categoria-activa', btn === botonClic);
    btn.classList.toggle('pill-categoria-inactiva', btn !== botonClic);
  });
  cargarContenidos();
}

function tarjetaContenido(contenido) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta-contenido';

  const insignia = contenido.esPremium
    ? `<span class="insignia-premium">🔒 Premium</span>`
    : `<span class="insignia-gratis">✓ Gratis</span>`;

  tarjeta.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <span class="text-2xl leading-none">${ICONOS_TIPO[contenido.tipo] || '📦'}</span>
      ${insignia}
    </div>
    <h3 class="line-clamp-2 text-sm font-semibold text-slate-800">${escaparHtml(contenido.titulo)}</h3>
    <p class="line-clamp-2 text-xs text-slate-500">${escaparHtml(contenido.descripcion || contenido.autor || '')}</p>
    <div class="mt-1 flex items-center justify-between text-[11px] text-slate-400">
      <span>${contenido.tipo.toUpperCase()} · ${formatearTamano(contenido.tamanoBytes)}</span>
      <span>${contenido.vecesDescargado} descargas</span>
    </div>
    <button class="boton-primario mt-1" data-descargar>
      ${contenido.esPremium ? 'Desbloquear con PIN' : 'Descargar'}
    </button>
  `;

  tarjeta.querySelector('[data-descargar]').addEventListener('click', () => manejarDescarga(contenido));
  return tarjeta;
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto || '';
  return div.innerHTML;
}

async function cargarContenidos() {
  const params = new URLSearchParams();
  if (estado.categoriaActiva) params.set('categoria', estado.categoriaActiva);
  if (estado.busqueda) params.set('q', estado.busqueda);

  try {
    const { datos } = await apiFetch(`/api/contenidos?${params.toString()}`);
    el.grilla.innerHTML = '';
    el.mensajeVacio.classList.toggle('hidden', datos.contenidos.length > 0);
    for (const contenido of datos.contenidos) {
      el.grilla.appendChild(tarjetaContenido(contenido));
    }
  } catch (err) {
    mostrarToast('No se pudo cargar el catálogo. Intenta de nuevo.');
    console.error(err);
  }
}

function manejarDescarga(contenido) {
  if (!contenido.esPremium) {
    window.location.href = `/api/contenidos/${contenido.id}/descargar`;
    return;
  }
  abrirModalPin(contenido);
}

function abrirModalPin(contenido) {
  estado.contenidoSeleccionado = contenido;
  el.modalTitulo.textContent = contenido.titulo;
  el.modalInput.value = '';
  el.modalError.classList.add('hidden');
  el.modal.classList.remove('hidden');
  el.modal.classList.add('flex');
  setTimeout(() => el.modalInput.focus(), 50);
}

function cerrarModalPin() {
  el.modal.classList.add('hidden');
  el.modal.classList.remove('flex');
  estado.contenidoSeleccionado = null;
}

async function validarPinYDescargar() {
  const contenido = estado.contenidoSeleccionado;
  if (!contenido) return;

  const codigo = el.modalInput.value.trim().toUpperCase();
  if (!codigo) {
    el.modalError.textContent = MOTIVOS_PIN.datos_incompletos;
    el.modalError.classList.remove('hidden');
    return;
  }

  el.modalValidar.disabled = true;
  el.modalValidar.textContent = 'Validando…';

  try {
    const { datos } = await apiFetch('/api/pins/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, contenidoId: contenido.id }),
    });

    if (!datos.ok) {
      el.modalError.textContent = MOTIVOS_PIN[datos.motivo] || 'No se pudo validar el PIN.';
      el.modalError.classList.remove('hidden');
      return;
    }

    mostrarToast('PIN válido. Iniciando descarga…');
    window.location.href = datos.descargaUrl;
    cerrarModalPin();
    setTimeout(cargarContenidos, 800); // refresca contador de descargas
  } catch (err) {
    el.modalError.textContent = 'Error de conexión. Intenta de nuevo.';
    el.modalError.classList.remove('hidden');
    console.error(err);
  } finally {
    el.modalValidar.disabled = false;
    el.modalValidar.textContent = 'Validar y descargar';
  }
}

// --- Eventos ---
el.campoBusqueda.addEventListener('input', (e) => {
  estado.busqueda = e.target.value.trim();
  clearTimeout(estado.temporizadorBusqueda);
  estado.temporizadorBusqueda = setTimeout(cargarContenidos, 350);
});

el.modalValidar.addEventListener('click', validarPinYDescargar);
el.modalCancelar.addEventListener('click', cerrarModalPin);
el.modalCerrar.addEventListener('click', cerrarModalPin);
el.modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') validarPinYDescargar();
});

// El pill "Todo" ya existe en el HTML estático; solo se le conecta el evento.
document.querySelector('[data-pill][data-slug=""]')?.addEventListener('click', (e) => {
  seleccionarCategoria('', e.currentTarget);
});

// --- Arranque ---
cargarEstadoNodo();
cargarCategorias();
cargarContenidos();
