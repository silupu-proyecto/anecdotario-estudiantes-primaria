/* api.js: sesión, datos guardados en el navegador y llamadas a la API — Anecdotario · Colegio Proyecto */

/* ---------------- Sesión (correo + PIN) ---------------- */

function guardarLocal(clave, valor) { try { localStorage.setItem(clave, valor); } catch (e) {} }
function leerLocal(clave) { try { return localStorage.getItem(clave); } catch (e) { return null; } }
function borrarLocal(clave) { try { localStorage.removeItem(clave); } catch (e) {} }

$('formLogin').onsubmit = async (ev) => {
  ev.preventDefault();
  let correo = $('correo').value.trim().toLowerCase();
  if (correo && !correo.includes('@')) correo += DOMINIO; // permite escribir solo "csilupu"
  const pin = $('pin').value.trim();
  $('msgLogin').textContent = '';
  $('btnEntrar').disabled = true;
  $('btnEntrar').textContent = 'Entrando…';
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion: 'entrar', correo, pin })
    });
    const res = await r.json();
    if (!res.ok) throw new Error(res.mensaje || 'No se pudo ingresar');
    // Si en este celular entra otro profesor, se reinicia la página para no mezclar datos
    if (estado.docente && estado.docente.correo !== correo) {
      guardarLocal('anec_token', res.token);
      guardarLocal('anec_correo', correo);
      location.reload();
      return;
    }
    estado.token = res.token;
    guardarLocal('anec_token', res.token);
    guardarLocal('anec_correo', correo);
    $('pin').value = '';
    $('login').classList.add('oculto');
    if (!estado.docente) iniciar(); else sincronizar();
  } catch (e) {
    $('msgLogin').textContent = e.message === 'Failed to fetch' ? 'Sin conexión. Inténtalo de nuevo.' : e.message;
  } finally {
    $('btnEntrar').disabled = false;
    $('btnEntrar').textContent = 'Entrar';
  }
};

function pedirLogin(mensaje) {
  estado.token = null;
  borrarLocal('anec_token');
  $('msgLogin').textContent = mensaje || '';
  $('correo').value = leerLocal('anec_correo') || '';
  $('login').classList.remove('oculto');
}

$('btnSalir').onclick = () => {
  // Al salir se borra también la lista guardada (por si el celular es compartido)
  borrarLocal(claveDatos());
  borrarLocal('anec_token');
  borrarLocal('anec_seccion');
  location.reload();
};

/* ---------------- Datos guardados en el navegador ---------------- */

function claveDatos() {
  return 'anec_datos_' + (leerLocal('anec_correo') || '');
}

function leerCache() {
  try { return JSON.parse(leerLocal(claveDatos()) || 'null'); } catch (e) { return null; }
}

function guardarCache(version, datos) {
  guardarLocal(claveDatos(), JSON.stringify({ version, datos, guardado: Date.now() }));
}

/* ---------------- API ---------------- */

async function api(accion, datos) {
  if (!estado.token) {
    pedirLogin('Vuelve a ingresar (no se pierde lo que marcaste).');
    throw new Error('sesion');
  }
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ accion, token: estado.token }, datos || {}))
  });
  const res = await r.json();
  if (!res.ok) {
    if (res.codigo === 'token') { pedirLogin(res.mensaje); throw new Error('sesion'); }
    if (res.codigo === 'sin_permiso' || res.codigo === 'dominio') { pedirLogin(res.mensaje); throw new Error('sesion'); }
    const err = new Error(res.mensaje || 'Error del servidor');
    err.codigo = res.codigo;
    throw err;
  }
  return res;
}

function aviso(texto, error) {
  const t = $('toast');
  t.textContent = texto;
  t.className = error ? 'error' : '';
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => t.classList.add('oculto'), error ? 5000 : 2500);
}

