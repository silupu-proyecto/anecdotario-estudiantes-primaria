/* reporte.js: Reporte semanal, correo y WhatsApp (solo tutores) — Anecdotario · Colegio Proyecto */

/* =================================================================== */
/* Reporte semanal (solo tutores)                                       */
/* =================================================================== */

const rep = {
  seccion: null, semana: null, datos: null, filtro: 'todos', abiertos: new Set(),
  incluirAnteriores: leerLocal('anec_incluirAnt') === '1', cargando: false, enviando: false,
  guardando: new Set(), // anotaciones cuyo "No enviar" se está guardando
  cambiosEnCurso: 0
};
$('incluirAnt').checked = rep.incluirAnteriores;

const ESTADOS = {
  pendiente: '🟡 Pendiente', enviado: '✅ Enviado', sinCorreo: '⚪ Sin correo', nada: '🚫 Todo excluido'
};

function esTutor() {
  return !!(estado.docente && estado.docente.tutorDe && estado.docente.tutorDe.length);
}

function actualizarVistas() {
  $('vistas').classList.toggle('oculto', !esTutor());
  if (!esTutor() && estado.vista !== 'registrar') mostrarVista('registrar');
  // Los tutores traen sus citaciones por detrás, para que la pestaña abra al instante
  if (esTutor() && typeof precargarCitaciones === 'function') precargarCitaciones();
}

function mostrarVista(v) {
  estado.vista = v;
  document.querySelectorAll('#vistas button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === v));
  $('vistaRegistrar').classList.toggle('oculto', v !== 'registrar');
  $('barra').classList.toggle('oculto', v !== 'registrar');
  $('vistaReporte').classList.toggle('oculto', v !== 'reporte');
  $('vistaCitaciones').classList.toggle('oculto', v !== 'citaciones');
  window.scrollTo(0, 0);
  if (v === 'reporte') abrirReporte();
  if (v === 'citaciones') abrirCitaciones();
}

document.querySelectorAll('#vistas button').forEach((b) => { b.onclick = () => mostrarVista(b.dataset.vista); });

function abrirReporte() {
  const tutorDe = estado.docente.tutorDe;
  if (!tutorDe.includes(rep.seccion)) {
    const guardada = leerLocal('anec_repSeccion');
    rep.seccion = tutorDe.includes(guardada) ? guardada : tutorDe[0];
  }
  // Selector de sección solo si es tutor de varias
  const cont = $('repSecciones');
  cont.innerHTML = '';
  cont.classList.toggle('oculto', tutorDe.length < 2);
  tutorDe.forEach((sec) => {
    const b = document.createElement('button');
    b.className = 'chip' + (sec === rep.seccion ? ' activo' : '');
    b.textContent = sec;
    b.onclick = () => {
      rep.seccion = sec;
      guardarLocal('anec_repSeccion', sec);
      cont.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c === b));
      cargarReporte();
    };
    cont.appendChild(b);
  });
  cargarReporte();
}

function sumarDias(fechaTxt, dias) {
  const [a, m, d] = fechaTxt.split('-').map(Number);
  const f = new Date(a, m - 1, d + dias, 12);
  return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
}

$('semAnt').onclick = () => { if (rep.datos) { rep.semana = sumarDias(rep.datos.semana.lunes, -7); cargarReporte(); } };
$('semSig').onclick = () => { if (rep.datos) { rep.semana = sumarDias(rep.datos.semana.lunes, 7); cargarReporte(); } };
$('incluirAnt').onchange = () => {
  rep.incluirAnteriores = $('incluirAnt').checked;
  guardarLocal('anec_incluirAnt', rep.incluirAnteriores ? '1' : '0');
  cargarReporte();
};
$('repBuscar').oninput = pintarReporte;

// silencioso = true: actualiza por detrás sin "Cargando…", sin mover el scroll ni cerrar tarjetas
async function cargarReporte(silencioso) {
  const pedido = rep.seccion + '|' + rep.semana + '|' + rep.incluirAnteriores;
  if (silencioso && (!rep.datos || rep.cambiosEnCurso > 0)) return;
  rep.cargando = pedido;
  if (!silencioso) {
    $('repLista').innerHTML = '<p class="vacio">Cargando…</p>';
    $('repFiltros').innerHTML = '';
    $('btnEnviarTodos').disabled = true;
  }
  try {
    const res = await api('reporte', { seccion: rep.seccion, semana: rep.semana, incluirAnteriores: rep.incluirAnteriores });
    if (rep.cargando !== pedido) return; // llegó tarde una respuesta vieja
    // Si mientras tanto el tutor tachó algo, no se pisa su cambio: se espera a que termine
    if (silencioso && rep.cambiosEnCurso > 0) return;
    rep.datos = res;
    rep.semana = res.semana.lunes;
    pintarReporte(silencioso);
  } catch (e) {
    if (e.message !== 'sesion' && !silencioso) $('repLista').innerHTML = '<p class="vacio">❌ ' + e.message + '</p>';
  } finally {
    if (rep.cargando === pedido) rep.cargando = false;
  }
}

// Mismo criterio que el servidor (estadoDe_ en Reportes.gs)
function estadoLocal(a) {
  const pendientes = a.registros.filter((r) => !r.noEnviar && !r.enviado).length;
  if (!pendientes) return a.registros.some((r) => r.enviado) ? 'enviado' : 'nada';
  return a.correos.length ? 'pendiente' : 'sinCorreo';
}

function contar(alumnos) {
  const c = { todos: alumnos.length, pendiente: 0, enviado: 0, sinCorreo: 0 };
  alumnos.forEach((a) => { if (c[a.estado] !== undefined) c[a.estado]++; });
  return c;
}

function pintarReporte(conservarScroll) {
  const d = rep.datos;
  if (!d) return;
  const y = window.scrollY;
  const sem = d.semana;
  $('semTxt').textContent = 'Semana del ' + sem.etiqueta;
  $('semSub').textContent = rep.seccion + (sem.esActual ? ' · semana actual' : '');
  $('semSig').disabled = sem.esActual || sem.esFutura;

  // Filtros con contadores
  const c = contar(d.alumnos);
  const filtros = [['todos', 'Todos'], ['pendiente', '🟡 Pendientes'], ['enviado', '✅ Enviados'], ['sinCorreo', '⚪ Sin correo']];
  const cf = $('repFiltros');
  cf.innerHTML = '';
  filtros.forEach(([k, txt]) => {
    const b = document.createElement('button');
    b.className = 'filtro' + (rep.filtro === k ? ' activo' : '');
    b.textContent = txt + ' (' + c[k] + ')';
    b.onclick = () => { rep.filtro = k; pintarReporte(); };
    cf.appendChild(b);
  });

  // Lista
  const q = $('repBuscar').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lista = d.alumnos.filter((a) =>
    (rep.filtro === 'todos' || a.estado === rep.filtro) &&
    (!q || a.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)));
  const cont = $('repLista');
  cont.innerHTML = '';
  if (!d.alumnos.length) {
    cont.innerHTML = '<p class="vacio">No hay anotaciones en esta semana.</p>';
  } else if (!lista.length) {
    cont.innerHTML = '<p class="vacio">Ningún alumno en este filtro.</p>';
  }
  lista.forEach((a) => cont.appendChild(tarjetaAlumno(a)));

  $('repPie').textContent =
    (d.sinAnotaciones ? d.sinAnotaciones + ' alumno(s) sin anotaciones esta semana (no reciben correo). ' : '') +
    'Envíos disponibles hoy: ' + d.cuota + '.';

  // Barra inferior
  $('repResumen').textContent = c.pendiente
    ? c.pendiente + ' pendiente(s)' + (c.sinCorreo ? ' · ' + c.sinCorreo + ' sin correo' : '')
    : (c.todos ? 'Nada pendiente por enviar' : '');
  $('btnEnviarTodos').disabled = !c.pendiente || rep.enviando || rep.cambiosEnCurso > 0;
  $('btnEnviarTodos').textContent = rep.enviando ? 'Enviando…' : 'Enviar pendientes (' + c.pendiente + ')';
  if (conservarScroll) window.scrollTo(0, y);
}

function tarjetaAlumno(a) {
  const caja = document.createElement('div');
  caja.className = 'rep-alumno';

  const logros = a.registros.filter((r) => r.tipo === 'Logro' && !r.noEnviar).length;
  const mejorar = a.registros.filter((r) => r.tipo !== 'Logro' && !r.noEnviar).length;
  const [apellidos, nombres] = a.nombre.split(', ');

  const cab = document.createElement('button');
  cab.className = 'rep-cab';
  const nom = document.createElement('div');
  nom.className = 'nom';
  const b = document.createElement('b'); b.textContent = apellidos || a.nombre;
  const sp = document.createElement('span'); sp.textContent = aTitulo(nombres || '');
  nom.append(b, sp);
  const cu = document.createElement('span');
  cu.className = 'cuentas';
  cu.textContent = '🌟 ' + logros + ' · 📌 ' + mejorar + (a.whatsapp && !a.whatsapp.pendientes ? ' · 💬✓' : '');
  const es = document.createElement('span');
  es.className = 'estado ' + a.estado;
  es.textContent = ESTADOS[a.estado] || a.estado;
  cab.append(nom, cu, es);
  cab.onclick = () => {
    rep.abiertos.has(a.id) ? rep.abiertos.delete(a.id) : rep.abiertos.add(a.id);
    det.classList.toggle('oculto');
  };
  caja.appendChild(cab);

  const det = document.createElement('div');
  det.className = 'rep-det' + (rep.abiertos.has(a.id) ? '' : ' oculto');

  a.registros.forEach((r) => {
    const fila = document.createElement('div');
    fila.className = 'rep-reg' + (r.noEnviar ? ' excluido' : '');
    const info = document.createElement('div');
    info.className = 'info';
    const t = document.createElement('div');
    t.textContent = (r.tipo === 'Logro' ? '🌟 ' : r.gravedad === 'Grave' ? '🔴 ' : '📌 ') + r.incidente;
    if (r.anterior) { const g = document.createElement('span'); g.className = 'tag ant'; g.textContent = 'semana anterior'; t.appendChild(g); }
    if (r.enviado) { const g = document.createElement('span'); g.className = 'tag env'; g.textContent = '📧 ' + r.enviado; t.appendChild(g); }
    if (r.whatsapp) { const g = document.createElement('span'); g.className = 'tag wa'; g.textContent = '💬 ' + r.whatsapp; t.appendChild(g); }
    const sm = document.createElement('small');
    sm.textContent = r.dia + ' ' + r.hora + ' · ' + r.curso + ' · ' + r.docente;
    info.append(t, sm);
    if (r.nota) { const em = document.createElement('em'); em.textContent = '“' + r.nota + '”'; info.appendChild(em); }
    fila.appendChild(info);
    if (!r.enviado) {
      const x = document.createElement('button');
      x.className = 'btn-mini';
      x.textContent = r.noEnviar ? 'Incluir' : 'No enviar';
      x.disabled = rep.guardando.has(r.id);
      x.onclick = () => cambiarNoEnviar(a, r);
      fila.appendChild(x);
    }
    det.appendChild(fila);
  });

  const co = document.createElement('div');
  co.className = 'correos';
  co.textContent = a.correos.length ? '📧 ' + a.correos.join(', ')
    : (a.enLista ? '📧 Sin correo de los padres. Complétalo desde Fichas.' : '⚠️ Este alumno ya no está en la lista de la sección.');
  det.appendChild(co);

  if (a.correos.length && a.estado !== 'nada') {
    const reenviar = a.estado === 'enviado';
    const acc = document.createElement('div');
    acc.className = 'acciones';
    const bv = document.createElement('button');
    bv.className = 'btn';
    bv.textContent = '👁 Vista previa';
    bv.onclick = () => vistaPrevia(a, reenviar, bv);
    const be = document.createElement('button');
    be.className = 'btn primario';
    be.textContent = reenviar ? 'Reenviar' : 'Enviar a sus padres';
    be.onclick = () => enviarUno(a, reenviar);
    acc.append(bv, be);
    det.appendChild(acc);
  }

  // WhatsApp: se abre en el celular del tutor con el mensaje ya escrito
  if (a.whatsapp) {
    const w = a.whatsapp;
    const link = document.createElement('a');
    const reenviar = !w.pendientes;
    link.className = 'btn-wa' + (reenviar ? ' reenviar' : '');
    link.href = 'https://wa.me/' + w.celular + '?text=' + encodeURIComponent(w.texto);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = (reenviar ? '💬 Reenviar WhatsApp a ' : '💬 Enviar WhatsApp a ') + w.para +
      (w.ultimo ? ' (último: ' + w.ultimo + ')' : '');
    link.onclick = () => marcarWhatsApp(w.ids);
    det.appendChild(link);
  } else if (a.enLista && a.estado !== 'nada') {
    const sc = document.createElement('div');
    sc.className = 'sin-cel';
    sc.textContent = '💬 Sin celular de los padres. Complétalo desde Fichas.';
    det.appendChild(sc);
  }

  // Citar a los padres de este alumno (abre el formulario en la pestaña Citaciones)
  if (a.enLista) {
    const bc = document.createElement('button');
    bc.className = 'btn btn-citar';
    bc.textContent = '📅 Citar a los padres';
    bc.onclick = () => nuevaCitacion(rep.seccion, a.id);
    det.appendChild(bc);
  }
  caja.appendChild(det);
  return caja;
}

// Se registra al abrir WhatsApp (el envío final lo hace el tutor en su celular)
async function marcarWhatsApp(ids) {
  try {
    await api('marcarWhatsApp', { seccion: rep.seccion, ids });
    setTimeout(() => cargarReporte(true), 1500);
  } catch (e) {
    if (e.message !== 'sesion') aviso('No se pudo registrar el envío por WhatsApp: ' + e.message, true);
  }
}

// Actualización optimista: se tacha al instante y se guarda por detrás
async function cambiarNoEnviar(a, r) {
  if (rep.guardando.has(r.id)) return;
  const valor = !r.noEnviar;
  const aplicar = (v) => {
    r.noEnviar = v;
    a.estado = estadoLocal(a);
    // El texto de WhatsApp se recalcula en el servidor; mientras tanto se oculta si ya no queda nada
    if (a.whatsapp && !a.registros.some((x) => !x.noEnviar)) a.whatsapp = null;
    pintarReporte(true);
  };

  rep.guardando.add(r.id);
  rep.cambiosEnCurso++;
  aplicar(valor);
  try {
    await api('noEnviar', { seccion: rep.seccion, id: r.id, valor });
  } catch (e) {
    aplicar(!valor); // se revierte
    if (e.message !== 'sesion') aviso('❌ No se pudo guardar: ' + e.message, true);
  } finally {
    rep.guardando.delete(r.id);
    rep.cambiosEnCurso--;
    pintarReporte(true);
    // Cuando terminan todos los cambios, se sincroniza en silencio (actualiza el texto de WhatsApp)
    if (rep.cambiosEnCurso === 0) cargarReporte(true);
  }
}

/* ---- Vista previa ---- */

let enviarDesdeModal = null;

async function vistaPrevia(a, reenviar, boton) {
  boton.disabled = true;
  try {
    const res = await api('vistaPrevia', {
      seccion: rep.seccion, semana: rep.semana, incluirAnteriores: rep.incluirAnteriores, alumnoId: a.id, reenviar
    });
    $('modalPara').textContent = res.para.join(', ');
    $('modalAsunto').textContent = res.asunto;
    $('modalMarco').srcdoc = res.html;
    $('modalEnviar').textContent = reenviar ? 'Reenviar' : 'Enviar';
    enviarDesdeModal = () => enviarUno(a, reenviar);
    $('modal').classList.remove('oculto');
  } catch (e) {
    if (e.message !== 'sesion') aviso('❌ ' + e.message, true);
  } finally {
    boton.disabled = false;
  }
}

function cerrarModal() {
  $('modal').classList.add('oculto');
  $('modalMarco').srcdoc = '';
  enviarDesdeModal = null;
}
$('modalCerrar').onclick = cerrarModal;
$('modal').onclick = (ev) => { if (ev.target === $('modal')) cerrarModal(); };
$('modalEnviar').onclick = () => { const f = enviarDesdeModal; cerrarModal(); if (f) f(); };

/* ---- Envío ---- */

async function enviarUno(a, reenviar) {
  const txt = (reenviar ? '¿Reenviar' : '¿Enviar') + ' el reporte de ' + a.nombre + ' a:\n' + a.correos.join('\n') + '?';
  if (!confirm(txt)) return;
  await enviar([a.id], reenviar);
}

$('btnEnviarTodos').onclick = async () => {
  const pendientes = rep.datos.alumnos.filter((a) => a.estado === 'pendiente');
  if (!pendientes.length) return;
  if (!confirm('¿Enviar el reporte a los padres de ' + pendientes.length + ' alumno(s)?\n\n' +
      'Cada familia recibe solo el correo de su hijo(a).')) return;
  await enviar(pendientes.map((a) => a.id), false);
};

async function enviar(ids, reenviar) {
  if (rep.enviando) return;
  rep.enviando = true;
  pintarReporte();
  aviso('Enviando… no cierres la app');
  try {
    const res = await api('enviar', {
      seccion: rep.seccion, semana: rep.semana, incluirAnteriores: rep.incluirAnteriores, alumnos: ids, reenviar
    });
    const partes = ['✅ Enviados: ' + res.enviados];
    if (res.sinCorreo) partes.push(res.sinCorreo + ' sin correo');
    if (res.faltan) partes.push('faltan ' + res.faltan + ': vuelve a pulsar Enviar pendientes');
    if (res.errores.length) partes.push(res.errores.length + ' con error (' + res.errores.map((x) => x.nombre).join(', ') + ')');
    aviso(partes.join(' · '), res.errores.length > 0 || res.faltan > 0);
  } catch (e) {
    if (e.message !== 'sesion') {
      aviso('❌ ' + (e.message === 'Failed to fetch'
        ? 'Se perdió la conexión. Revisa la lista antes de reintentar: algunos pueden haberse enviado.' : e.message), true);
    }
  } finally {
    rep.enviando = false;
    cargarReporte(true);
  }
}

