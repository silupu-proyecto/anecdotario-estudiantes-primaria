/* registrar.js: carga inicial y pantalla Registrar — Anecdotario · Colegio Proyecto */

/* ---------------- Inicio ---------------- */

async function iniciar() {
  $('app').classList.remove('oculto');
  // 1) Si hay datos guardados, se muestran al instante
  const cache = leerCache();
  if (cache && cache.datos) aplicarDatos(cache.datos, false);
  // 2) Por detrás se revisa el Sheets por si hubo cambios
  await sincronizar();
}

async function sincronizar(manual) {
  const cache = leerCache();
  try {
    const res = await api('datos', { version: cache && cache.version });
    ultimaSync = Date.now();
    if (res.sinCambios) {
      if (manual) aviso('✅ Todo al día, no hay cambios');
      return;
    }
    guardarCache(res.version, res.datos);
    const yaSeMostraba = !!estado.docente;
    aplicarDatos(res.datos, yaSeMostraba);
    if (yaSeMostraba) aviso('🔄 Lista actualizada');
  } catch (e) {
    if (e.message === 'sesion') return;
    const msg = e.message === 'Failed to fetch' ? 'No se pudo conectar con el Sheets' : e.message;
    if (!estado.docente) {
      $('cargando').textContent = '❌ ' + msg + '. Revisa tu internet y recarga la página.';
    } else {
      // Con datos guardados se sigue trabajando, pero se avisa que pueden estar desactualizados
      aviso('⚠️ ' + msg + '. La lista puede no estar actualizada.', true);
    }
  } finally {
    if (manual && estado.vista === 'reporte' && typeof cargarReporte === 'function') cargarReporte(true);
  }
}


function aplicarDatos(d, conservar) {
  estado.docente = d.docente;
  estado.incidentes = d.incidentes || [];
  estado.alumnosPorSeccion = d.alumnos || {};
  $('nombreDocente').textContent = d.docente.nombre;
  $('cursoDocente').textContent = d.docente.curso;

  if (!d.docente.secciones.length) {
    $('cargando').textContent = 'No tienes secciones asignadas. Pide a coordinación que revise la pestaña Docentes.';
    $('cargando').classList.remove('oculto');
    $('contenido').classList.add('oculto');
    return;
  }

  // Si alguna anotación elegida ya no existe, se deselecciona
  Array.from(estado.acciones).forEach((n) => {
    if (!estado.incidentes.some((i) => i.incidente === n)) estado.acciones.delete(n);
  });
  pintarSecciones();
  pintarOpciones();

  const preferida = conservar && estado.seccion ? estado.seccion : leerLocal('anec_seccion');
  const sec = d.docente.secciones.includes(preferida) ? preferida : d.docente.secciones[0];
  elegirSeccion(sec, conservar && sec === estado.seccion);

  $('cargando').classList.add('oculto');
  $('contenido').classList.remove('oculto');
  actualizarVistas();
}

function pintarSecciones() {
  const cont = $('secciones');
  cont.innerHTML = '';
  estado.docente.secciones.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = s;
    b.onclick = () => elegirSeccion(s);
    b.dataset.sec = s;
    cont.appendChild(b);
  });
  // Si solo tiene una sección, no hace falta mostrar el selector
  $('tarjetaSecciones').classList.toggle('oculto', estado.docente.secciones.length === 1);
}

// Cambiar de sección es instantáneo: los alumnos ya están en el navegador
function elegirSeccion(sec, conservarSeleccion) {
  const cambia = sec !== estado.seccion;
  estado.seccion = sec;
  estado.alumnos = estado.alumnosPorSeccion[sec] || [];

  if (conservarSeleccion) {
    const ids = new Set(estado.alumnos.map((a) => a.id));
    Array.from(estado.seleccion).forEach((id) => { if (!ids.has(id)) estado.seleccion.delete(id); });
  } else {
    estado.seleccion.clear();
  }

  guardarLocal('anec_seccion', sec);
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c.dataset.sec === sec));
  $('seccionHoy').textContent = sec;
  pintarAlumnos();
  if (cambia) {
    $('hoy').innerHTML = '<p class="vacio">Cargando…</p>';
    cargarHoy();
  }
  actualizarBarra();
}

// Al volver a la app (por ejemplo, después de tenerla minimizada) se revisa si hubo cambios
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado.token && estado.docente &&
      Date.now() - ultimaSync > MINUTOS_ENTRE_REVISIONES * 60000) {
    sincronizar();
  }
});

/* ---------------- Alumnos ---------------- */

function pintarAlumnos() {
  const filtro = $('buscar').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cont = $('alumnos');
  cont.innerHTML = '';
  const lista = estado.alumnos.filter((a) =>
    !filtro || a.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(filtro));
  if (!estado.alumnos.length) { cont.innerHTML = '<p class="vacio">Esta sección no tiene alumnos en la lista.</p>'; return; }
  if (!lista.length) { cont.innerHTML = '<p class="vacio">Ningún alumno coincide.</p>'; return; }

  lista.forEach((a) => {
    const [apellidos, nombres] = a.nombre.split(', ');
    const b = document.createElement('button');
    b.className = 'alumno' + (estado.seleccion.has(a.id) ? ' sel' : '');
    const bb = document.createElement('b'); bb.textContent = apellidos || a.nombre;
    const sp = document.createElement('span'); sp.textContent = aTitulo(nombres || '');
    b.append(bb, sp);
    b.onclick = () => {
      estado.seleccion.has(a.id) ? estado.seleccion.delete(a.id) : estado.seleccion.add(a.id);
      b.classList.toggle('sel');
      actualizarBarra();
    };
    cont.appendChild(b);
  });
}

function aTitulo(s) {
  return s.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
}

$('buscar').oninput = pintarAlumnos;
$('btnLimpiar').onclick = () => { estado.seleccion.clear(); pintarAlumnos(); actualizarBarra(); };

/* ---------------- Anotaciones ---------------- */

document.querySelectorAll('.pestana').forEach((p) => {
  p.onclick = () => {
    // Cambiar de pestaña NO borra lo elegido: se puede marcar un logro y algo a mejorar a la vez
    estado.tipo = p.dataset.tipo;
    document.querySelectorAll('.pestana').forEach((x) => x.classList.toggle('activo', x === p));
    pintarOpciones();
  };
});

function pintarOpciones() {
  const cont = $('opciones');
  cont.innerHTML = '';
  const delTipo = estado.incidentes.filter((i) => i.tipo === estado.tipo);
  const grupos = estado.tipo === 'Logro' ? ['—'] : ['Leve', 'Moderado', 'Grave'];

  grupos.forEach((g) => {
    const items = delTipo.filter((i) => (estado.tipo === 'Logro') || i.gravedad === g);
    if (!items.length) return;
    if (estado.tipo !== 'Logro') {
      const t = document.createElement('div');
      t.className = 'grupo';
      t.textContent = g;
      cont.appendChild(t);
    }
    const caja = document.createElement('div');
    caja.className = 'opciones';
    items.forEach((i) => {
      const b = document.createElement('button');
      b.className = 'opcion ' + (estado.tipo === 'Logro' ? 'Logro' : i.gravedad) +
        (estado.acciones.has(i.incidente) ? ' sel' : '');
      b.textContent = i.incidente;
      b.onclick = () => {
        estado.acciones.has(i.incidente) ? estado.acciones.delete(i.incidente) : estado.acciones.add(i.incidente);
        b.classList.toggle('sel');
        pintarElegidas();
        actualizarBarra();
      };
      caja.appendChild(b);
    });
    cont.appendChild(caja);
  });
  pintarElegidas();
}

// Muestra lo elegido (de ambas pestañas) y el contador en cada pestaña
function pintarElegidas() {
  const cont = $('elegidas');
  cont.innerHTML = '';
  const tipoDe = (n) => (estado.incidentes.find((i) => i.incidente === n) || {}).tipo;
  estado.acciones.forEach((n) => {
    const e = document.createElement('span');
    e.className = 'etiqueta';
    e.textContent = (tipoDe(n) === 'Logro' ? '🌟 ' : '📌 ') + n;
    const x = document.createElement('button');
    x.textContent = '×';
    x.title = 'Quitar';
    x.onclick = () => { estado.acciones.delete(n); pintarOpciones(); actualizarBarra(); };
    e.appendChild(x);
    cont.appendChild(e);
  });
  document.querySelectorAll('.pestana').forEach((p) => {
    const n = Array.from(estado.acciones).filter((a) => tipoDe(a) === p.dataset.tipo).length;
    const base = p.dataset.tipo === 'Logro' ? '🌟 Logro' : '📌 A mejorar';
    p.textContent = base;
    if (n) {
      const c = document.createElement('span');
      c.className = 'cuenta';
      const t = document.createElement('span');
      t.textContent = n;
      c.appendChild(t);
      p.appendChild(c);
    }
  });
}

$('btnLimpiarAcciones').onclick = () => { estado.acciones.clear(); pintarOpciones(); actualizarBarra(); };

/* ---------------- Guardar ---------------- */

function actualizarBarra() {
  const n = estado.seleccion.size;
  const m = estado.acciones.size;
  const listo = n > 0 && m > 0 && !estado.guardando;
  $('btnGuardar').disabled = !listo;
  $('btnGuardar').textContent = estado.guardando ? 'Guardando…' : 'Guardar';
  const txtAlumnos = n === 1 ? '1 alumno' : n + ' alumnos';
  const txtAcciones = m === 1 ? Array.from(estado.acciones)[0] : m + ' anotaciones';
  $('resumen').textContent =
    !n && !m ? 'Elige alumno(s) y anotación(es)' :
    !n ? txtAcciones + ' · elige alumno(s)' :
    !m ? txtAlumnos + ' · elige anotación(es)' :
    txtAlumnos + ' · ' + txtAcciones;
}

$('btnGuardar').onclick = async () => {
  if (estado.guardando) return;
  estado.guardando = true;
  actualizarBarra();
  try {
    const res = await api('guardar', {
      seccion: estado.seccion,
      alumnos: Array.from(estado.seleccion),
      incidentes: Array.from(estado.acciones),
      nota: $('nota').value
    });
    aviso('✅ Guardado (' + res.guardados + (res.guardados === 1 ? ' registro)' : ' registros)'));
    estado.seleccion.clear();
    estado.acciones.clear();
    $('nota').value = '';
    $('buscar').value = '';
    pintarAlumnos();
    pintarOpciones();
    cargarHoy();
  } catch (e) {
    if (e.message === 'sesion') return;
    if (['alumnos', 'incidente', 'seccion'].includes(e.codigo)) {
      // La lista cambió en el Sheets: se actualiza y el profe revisa antes de volver a guardar
      aviso('La lista cambió en el colegio. Ya se actualizó: revisa y vuelve a guardar.', true);
      sincronizar();
    } else {
      aviso('❌ ' + (e.message === 'Failed to fetch' ? 'Sin conexión. No se guardó, inténtalo de nuevo.' : e.message), true);
    }
  } finally {
    estado.guardando = false;
    actualizarBarra();
  }
};

/* ---------------- Registrado hoy ---------------- */

async function cargarHoy() {
  const sec = estado.seccion;
  try {
    const res = await api('hoy', { seccion: sec });
    if (sec !== estado.seccion) return;
    const cont = $('hoy');
    cont.innerHTML = '';
    if (!res.registros.length) { cont.innerHTML = '<p class="vacio">Aún no hay registros.</p>'; return; }
    res.registros.forEach((r) => {
      const fila = document.createElement('div');
      fila.className = 'registro';
      const punto = document.createElement('span');
      punto.className = 'punto';
      punto.style.background = r.tipo === 'Logro' ? 'var(--verde)' :
        r.gravedad === 'Grave' ? 'var(--rojo)' : r.gravedad === 'Moderado' ? '#f0b400' : '#c4c6d3';
      const info = document.createElement('div');
      info.className = 'info';
      const t1 = document.createElement('div'); t1.textContent = r.alumno;
      const t2 = document.createElement('small');
      t2.textContent = r.hora + ' · ' + r.incidente + (r.nota ? ' · "' + r.nota + '"' : '');
      info.append(t1, t2);
      fila.append(punto, info);
      if (!r.enviado) {
        const x = document.createElement('button');
        x.className = 'borrar';
        x.title = 'Borrar';
        x.textContent = '×';
        x.onclick = () => borrarRegistro(r, x);
        fila.appendChild(x);
      }
      cont.appendChild(fila);
    });
  } catch (e) { /* silencioso */ }
}

async function borrarRegistro(r, boton) {
  if (!confirm('¿Borrar "' + r.incidente + '" de ' + r.alumno + '?')) return;
  boton.disabled = true;
  try {
    await api('borrar', { seccion: estado.seccion, id: r.id });
    aviso('Registro borrado');
    cargarHoy();
  } catch (e) {
    boton.disabled = false;
    if (e.message !== 'sesion') aviso('❌ ' + e.message, true);
  }
}

