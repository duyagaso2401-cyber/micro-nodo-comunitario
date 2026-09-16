'use strict';

const form = document.getElementById('form-login');
const btn = document.getElementById('btn-login');
const error = document.getElementById('error-login');

// Si ya hay sesión activa, saltar directo al dashboard.
fetch('/api/admin/me')
  .then((r) => (r.ok ? (window.location.href = '/admin') : null))
  .catch(() => {});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Ingresando…';

  try {
    const respuesta = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario: form.usuario.value.trim(),
        password: form.password.value,
      }),
    });
    const datos = await respuesta.json();

    if (!datos.ok) {
      error.textContent = datos.error === 'credenciales_invalidas' ? 'Usuario o contraseña incorrectos.' : 'No se pudo iniciar sesión.';
      error.classList.remove('hidden');
      return;
    }

    window.location.href = '/admin';
  } catch (err) {
    error.textContent = 'Error de conexión. Intenta de nuevo.';
    error.classList.remove('hidden');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});
