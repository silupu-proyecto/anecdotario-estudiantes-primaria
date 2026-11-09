/* citaciones.js: citaciones a padres (solo tutores) — Anecdotario · Colegio Proyecto
 *
 * La citación oficial va en la agenda física. Aquí el tutor:
 *   - registra la citación (queda en la pestaña "Citaciones" del Sheets)
 *   - envía un recordatorio por correo (opcional) y por WhatsApp (opcional)
 *   - hace el seguimiento: Asistió / No asistió / Reprogramada y los acuerdos
 */

const cit = {
  seccion: null, datos: null, abiertos: new Set(), guardandoEstado: new Set(),
  form: { alumnoId: '', motivo: '', modalidad: 'Presencial', tipo: 'Recordatorio', solicitadaPor: 'Tutoría', anotaciones: new Set() },
  anotacionesDe: {}, // caché: alumnoId -> anotaciones recientes
  pendienteAbrir: null // { seccion, alumnoId } cuando se llega desde el Reporte
};

const CLASE_ESTADO = { 'Pendiente': 'pend', 'Asistió': 'asis', 'No asistió': 'noasis', 'Reprogramada': 'repro' };
const MOTIVOS_CIT = ['Conducta', 'Rendimiento', 'Seguimiento', 'Entrega de informes', 'Otro'];

/* ---------------- Precarga ----------------
 * Las citaciones (y las anotaciones recientes de la sección) se traen por detrás apenas
 * el tutor entra a la app. Así, al abrir la pestaña o el formulario, ya están listas. */
function precargarCitaciones() {
  if (cit.precargado || !estado.docente || !estado.docente.tutorDe.length) return;
  cit.precargado = true;
  if (!cit.seccion) {
    const guardada = leerLocal('anec_citSeccion');
    cit.seccion = estado.docente.tutorDe.includes(guardada) ? guardada : estado.docente.tutorDe[0];
  }
  cargarCitaciones(true);
}

/* ---------------- Entrada ---------------- */

// Desde la tarjeta de un alumno en el Reporte
function nuevaCitacion(seccion, alumnoId) {
  cit.pendienteAbrir = { seccion, alumnoId };
  mostrarVista('citaciones');
}

async function abrirCitaciones() {
  const tutorDe = estado.docente.tutorDe;
  if (cit.pendienteAbrir && tutorDe.includes(cit.pendienteAbrir.seccion)) {
    cit.seccion = cit.pendienteAbrir.seccion;
  } else if (!tutorDe.includes(cit.seccion)) {
    const guardada = leerLocal('anec_citSeccion');
    cit.seccion = tutorDe.includes(guardada) ? guardada : tutorDe[0];
  }
  pintarSeccionesCit();
  const abrir = cit.pendienteAbrir;
  cit.pendienteAbrir = null;
  const yaHayDatos = cit.datos && cit.datos.seccion === cit.seccion;
  if (abrir) {
    abrirFormulario(abrir.alumnoId); // al instante, sin esperar al Sheets
  } else {
    mostrarListaCit();
    if (yaHayDatos) pintarCitaciones(false);
  }
  // Con datos ya precargados se actualiza por detrás; si no, se cargan mostrando "Cargando…"
  cargarCitaciones(yaHayDatos || !!abrir);
}

function pintarSeccionesCit() {
  const tutorDe = estado.docente.tutorDe;
  const cont = $('citSecciones');
  cont.innerHTML = '';
  cont.classList.toggle('oculto', tutorDe.length < 2);
  tutorDe.forEach((sec) => {
    const b = document.createElement('button');
    b.className = 'chip' + (sec === cit.seccion ? ' activo' : '');
    b.textContent = sec;
    b.onclick = () => {
      cit.seccion = sec;
      guardarLocal('anec_citSeccion', sec);
      cont.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c === b));
      cit.anotacionesDe = {};
      cargarCitaciones(false);
    };
    cont.appendChild(b);
  });
}

/* ---------------- Lista ---------------- */

async function cargarCitaciones(silencioso) {
  const pedido = cit.seccion;
  if (!silencioso) $('citItems').innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    const res = await api('citaciones', { seccion: cit.seccion });
    if (pedido !== cit.seccion) return;
    if (silencioso && cit.guardandoEstado.size) return; // no pisar un cambio en curso
    cit.datos = res;
    pintarCitaciones(silencioso);
    // Si el formulario está abierto, se completan los datos de contacto y las anotaciones
    if (!$('citForm').classList.contains('oculto')) { pintarSolicitantes(); pintarMotivos(); autollenarDetalle(); alCambiarAlumno(); }
  } catch (e) {
    if (e.message !== 'sesion' && !silencioso) $('citItems').innerHTML = '<p class="vacio">❌ ' + e.message + '</p>';
  }
}

function mostrarListaCit() {
  $('citLista').classList.remove('oculto');
  $('citForm').classList.add('oculto');
  $('barraCit').classList.add('oculto');
}

function pintarCitaciones(conservarScroll) {
  const y = window.scrollY;
  const d = cit.datos;
  const cont = $('citItems');
  cont.innerHTML = '';
  const proximas = d.citaciones.filter((c) => c.proxima);
  const pasadas = d.citaciones.filter((c) => !c.proxima);
  $('citContador').textContent = proximas.length ? proximas.length + ' próxima(s)' : '';

  if (!d.citaciones.length && cit.seccion === d.seccion) {
    cont.innerHTML = '<p class="vacio">Aún no hay citaciones en ' + d.seccion + '.</p>';
  }
  [['Próximas', proximas], ['Anteriores', pasadas]].forEach(([titulo, lista]) => {
    if (!lista.length) return;
    const t = document.createElement('div');
    t.className = 'cit-sep';
    t.textContent = titulo;
    cont.appendChild(t);
    lista.forEach((c) => cont.appendChild(tarjetaCitacion(c)));
  });
  if (conservarScroll) window.scrollTo(0, y);
}

function tarjetaCitacion(c) {
  const caja = document.createElement('div');
  caja.className = 'rep-alumno';

  const [apellidos, nombres] = c.alumno.split(', ');
  const cab = document.createElement('button');
  cab.className = 'rep-cab';
  const nom = document.createElement('div');
  nom.className = 'nom';
  const b = document.createElement('b'); b.textContent = apellidos || c.alumno;
  const sp = document.createElement('span'); sp.textContent = aTitulo(nombres || '');
  nom.append(b, sp);
  const cu = document.createElement('span');
  cu.className = 'cuentas';
  cu.textContent = c.fechaCorta + ' · ' + c.horaTexto;
  const es = document.createElement('span');
  es.className = 'cit-estado ' + (CLASE_ESTADO[c.estado] || 'pend');
  es.textContent = c.estado;
  cab.append(nom, cu, es);
  caja.appendChild(cab);

  const det = document.createElement('div');
  det.className = 'rep-det' + (cit.abiertos.has(c.id) ? '' : ' oculto');
  cab.onclick = () => {
    cit.abiertos.has(c.id) ? cit.abiertos.delete(c.id) : cit.abiertos.add(c.id);
    det.classList.toggle('oculto');
  };

  const info = (etiqueta, texto) => {
    const p = document.createElement('div');
    p.className = 'cit-info';
    const bb = document.createElement('b'); bb.textContent = etiqueta + ': ';
    p.append(bb, document.createTextNode(texto));
    det.appendChild(p);
  };
  info('Cuándo', aTitulo(c.fechaTexto.charAt(0)) + c.fechaTexto.slice(1) + ', ' + c.horaTexto);
  info('Dónde', c.modalidad + (c.lugar ? ' · ' + c.lugar : ''));
  info('Con', c.con || '');
  info('Motivo', c.motivo + '. ' + c.detalle);
  if (c.anotaciones) {
    const an = document.createElement('div');
    an.className = 'cit-anot';
    an.textContent = c.anotaciones.replace(/ \[[^\]]+\]/g, '');
    det.appendChild(an);
  }
  const env = [];
  if (c.correoEnviado) env.push('📧 correo ' + c.correoEnviado);
  if (c.whatsappEnviado) env.push('💬 WhatsApp ' + c.whatsappEnviado);
  info('Tipo', c.tipo === 'Citación' ? 'Citación por la app' : 'Recordatorio (agenda)');
  info('Enviado', env.length ? env.join(' · ') : (c.tipo === 'Citación' ? 'aún no se envió' : 'solo agenda'));

  // Estado (actualización optimista)
  const est = document.createElement('div');
  est.className = 'estados';
  cit.datos.estados.forEach((e) => {
    const bt = document.createElement('button');
    bt.textContent = e;
    bt.className = c.estado === e ? 'sel' : '';
    bt.disabled = cit.guardandoEstado.has(c.id);
    bt.onclick = () => cambiarEstadoCit(c, e);
    est.appendChild(bt);
  });
  det.appendChild(est);

  // Acuerdos
  const lab = document.createElement('label');
  lab.className = 'campo';
  lab.textContent = 'Acuerdos de la reunión';
  const ta = document.createElement('textarea');
  ta.maxLength = 1500;
  ta.placeholder = 'Se llena después de la reunión.';
  ta.value = c.acuerdos || '';
  ta.style.marginTop = '0';
  const bg = document.createElement('button');
  bg.className = 'btn';
  bg.style.width = '100%';
  bg.style.marginTop = '8px';
  bg.textContent = 'Guardar acuerdos';
  bg.onclick = () => guardarAcuerdos(c, ta.value, bg);
  det.append(lab, ta, bg);

  // WhatsApp
  if (c.whatsapp) {
    const w = c.whatsapp;
    const link = document.createElement('a');
    link.className = 'btn-wa' + (c.whatsappEnviado ? ' reenviar' : '');
    link.href = 'https://wa.me/' + w.celular + '?text=' + encodeURIComponent(w.texto);
    link.target = '_blank';
    link.rel = 'noopener';
    const que = c.tipo === 'Citación' ? 'citación' : 'recordatorio';
    link.textContent = (c.whatsappEnviado ? '💬 Reenviar ' + que + ' a ' : '💬 Enviar ' + que + ' por WhatsApp a ') + w.para;
    link.onclick = () => marcarWhatsAppCit(c);
    det.appendChild(link);
  }

  caja.appendChild(det);
  return caja;
}

async function cambiarEstadoCit(c, nuevo) {
  if (c.estado === nuevo || cit.guardandoEstado.has(c.id)) return;
  const anterior = c.estado;
  cit.guardandoEstado.add(c.id);
  c.estado = nuevo;
  pintarCitaciones(true);
  try {
    await api('actualizarCitacion', { seccion: cit.seccion, id: c.id, estado: nuevo });
  } catch (e) {
    c.estado = anterior;
    if (e.message !== 'sesion') aviso('❌ No se pudo guardar: ' + e.message, true);
  } finally {
    cit.guardandoEstado.delete(c.id);
    pintarCitaciones(true);
  }
}

async function guardarAcuerdos(c, texto, boton) {
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    await api('actualizarCitacion', { seccion: cit.seccion, id: c.id, acuerdos: texto });
    c.acuerdos = texto;
    aviso('✅ Acuerdos guardados');
  } catch (e) {
    if (e.message !== 'sesion') aviso('❌ ' + e.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar acuerdos';
  }
}

async function marcarWhatsAppCit(c) {
  try {
    await api('marcarWhatsAppCitacion', { seccion: cit.seccion, id: c.id });
    setTimeout(() => cargarCitaciones(true), 1500);
  } catch (e) {
    if (e.message !== 'sesion') aviso('No se pudo registrar el WhatsApp: ' + e.message, true);
  }
}

/* ---------------- Formulario ---------------- */

$('btnNuevaCit').onclick = () => abrirFormulario('');
$('citCancelar').onclick = () => { mostrarListaCit(); window.scrollTo(0, 0); };

function hoyTexto() {
  const f = new Date();
  return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0');
}

// Alumnos de la sección: los del Sheets si ya llegaron; si no, los guardados en el navegador
function alumnosParaForm() {
  if (cit.datos && cit.datos.seccion === cit.seccion) return cit.datos.alumnos;
  return estado.alumnosPorSeccion[cit.seccion] || [];
}

function abrirFormulario(alumnoId) {
  const f = cit.form;
  f.alumnoId = alumnoId || '';
  f.motivo = '';
  f.modalidad = 'Presencial';
  f.tipo = 'Recordatorio';
  f.solicitadaPor = 'Tutoría';
  f.anotaciones = new Set();
  pintarSolicitantes();

  // Alumnos de la sección
  const sel = $('citAlumno');
  sel.innerHTML = '';
  const op0 = document.createElement('option');
  op0.value = '';
  op0.textContent = 'Elige un alumno…';
  sel.appendChild(op0);
  alumnosParaForm().forEach((a) => {
    const op = document.createElement('option');
    op.value = a.id;
    op.textContent = a.nombre;
    sel.appendChild(op);
  });
  sel.value = f.alumnoId;

  f.textoAuto = '';
  $('citDetalle').value = '';
  pintarMotivos();
  $('citFecha').min = hoyTexto();
  $('citFecha').value = '';
  $('citHora').value = '08:00';
  $('citLugar').value = leerLocal('anec_citLugar') || '';
  $('citCorreo').checked = true;
  pintarModalidad();
  pintarTipo();

  $('citLista').classList.add('oculto');
  $('citForm').classList.remove('oculto');
  $('barraCit').classList.remove('oculto');
  window.scrollTo(0, 0);
  alCambiarAlumno();
}

$('citAlumno').onchange = () => {
  cit.form.alumnoId = $('citAlumno').value;
  cit.form.anotaciones = new Set();
  autollenarDetalle(); // si el detalle es el texto automático, se actualiza con el nombre del nuevo alumno
  alCambiarAlumno();
};

/* ---- Motivos y detalle predefinido ----
 * Los textos vienen de Configuración (columnas H:I). {nombre} = primer nombre del alumno. */
function motivosParaForm() {
  if (datosListos() && cit.datos.motivos && cit.datos.motivos.length && typeof cit.datos.motivos[0] === 'object') {
    return cit.datos.motivos;
  }
  return MOTIVOS_CIT.map((m) => ({ motivo: m, texto: '' }));
}

function pintarMotivos() {
  const cm = $('citMotivos');
  cm.innerHTML = '';
  motivosParaForm().forEach((x) => {
    const b = document.createElement('button');
    b.className = 'opcion' + (cit.form.motivo === x.motivo ? ' sel' : '');
    b.textContent = x.motivo;
    b.onclick = () => {
      cit.form.motivo = x.motivo;
      cm.querySelectorAll('.opcion').forEach((y) => y.classList.toggle('sel', y === b));
      autollenarDetalle();
      actualizarBarraCit();
    };
    cm.appendChild(b);
  });
}

function primerNombreElegido() {
  const a = alumnoElegido();
  if (!a) return 'su niño(a)';
  const nombres = (a.nombre.split(', ')[1] || a.nombre).trim();
  return aTitulo(nombres.split(' ')[0]);
}

// Pone el texto del motivo solo si el detalle está vacío o sigue siendo el texto automático
function autollenarDetalle() {
  const m = motivosParaForm().find((x) => x.motivo === cit.form.motivo);
  const actual = $('citDetalle').value.trim();
  if (actual && actual !== cit.form.textoAuto) return; // el tutor ya escribió algo: no se toca
  const texto = m && m.texto ? m.texto.replace(/\{nombre\}/g, primerNombreElegido()) : '';
  $('citDetalle').value = texto;
  cit.form.textoAuto = texto;
}
['citDetalle', 'citFecha', 'citHora'].forEach((id) => { $(id).oninput = actualizarBarraCit; });
$('citCorreo').onchange = actualizarBarraCit;

document.querySelectorAll('#citModalidad .opcion').forEach((b) => {
  b.onclick = () => { cit.form.modalidad = b.dataset.mod; pintarModalidad(); };
});

document.querySelectorAll('#citTipo .opcion').forEach((b) => {
  b.onclick = () => { cit.form.tipo = b.dataset.tipo; pintarTipo(); };
});

// Tutoría (por defecto), cada curso con su profe, Psicopedagogía y Dirección
function pintarSolicitantes() {
  const lista = datosListos() && cit.datos.solicitantes ? cit.datos.solicitantes
    : [{ valor: 'Tutoría', etiqueta: 'Tutoría (yo)' }, { valor: 'Psicopedagogía', etiqueta: 'Psicopedagogía' },
      { valor: 'Dirección', etiqueta: 'Dirección' }];
  const sel = $('citSolicita');
  sel.innerHTML = '';
  lista.forEach((x) => {
    const op = document.createElement('option');
    op.value = x.valor;
    op.textContent = x.etiqueta;
    sel.appendChild(op);
  });
  sel.value = lista.some((x) => x.valor === cit.form.solicitadaPor) ? cit.form.solicitadaPor : 'Tutoría';
}
$('citSolicita').onchange = () => { cit.form.solicitadaPor = $('citSolicita').value; };

function pintarTipo() {
  const esCit = cit.form.tipo === 'Citación';
  document.querySelectorAll('#citTipo .opcion').forEach((b) => b.classList.toggle('sel', b.dataset.tipo === cit.form.tipo));
  $('citAyudaTipo').textContent = esCit
    ? 'El correo ES la citación (sin agenda). Después de guardar también podrás enviarla por WhatsApp.'
    : 'La citación oficial va en la agenda; el correo es un recordatorio. Después de guardar podrás enviar uno por WhatsApp.';
  actualizarBarraCit();
}

function pintarModalidad() {
  document.querySelectorAll('#citModalidad .opcion').forEach((b) =>
    b.classList.toggle('sel', b.dataset.mod === cit.form.modalidad));
  $('citLugar').placeholder = cit.form.modalidad === 'Virtual'
    ? 'Ej.: enlace de Google Meet' : 'Ej.: Sala de tutoría – 2do piso';
}

function alumnoElegido() {
  return alumnosParaForm().find((a) => a.id === cit.form.alumnoId) || null;
}

function datosListos() {
  return !!(cit.datos && cit.datos.seccion === cit.seccion);
}

async function alCambiarAlumno() {
  const a = alumnoElegido();
  const cont = $('citAnotaciones');
  // Datos de contacto: avisan si no habrá correo o WhatsApp
  if (!a) {
    $('citContacto').textContent = '';
    cont.innerHTML = '<p class="vacio">Elige un alumno.</p>';
  } else if (!datosListos()) {
    // Aún no llegan los datos del Sheets: el formulario se puede ir llenando igual
    $('citContacto').textContent = 'Cargando datos de contacto…';
    cont.innerHTML = '<p class="vacio">Cargando anotaciones…</p>';
  } else {
    $('citContacto').textContent =
      (a.tieneCorreo ? '📧 Tiene correo de los padres' : '📧 Sin correo') + ' · ' +
      (a.celularDe ? '💬 WhatsApp a ' + a.celularDe : '💬 Sin celular');
    if ($('citCorreo').disabled !== !a.tieneCorreo) $('citCorreo').checked = a.tieneCorreo;
    $('citCorreo').disabled = !a.tieneCorreo;
    const id = a.id;
    if (cit.datos.anotaciones) {
      pintarAnotacionesCit(cit.datos.anotaciones[id] || []);
    } else {
      // Respaldo por si la API es de una versión anterior
      cont.innerHTML = '<p class="vacio">Cargando anotaciones…</p>';
      try {
        if (!cit.anotacionesDe[id]) {
          const res = await api('anotacionesAlumno', { seccion: cit.seccion, alumnoId: id });
          cit.anotacionesDe[id] = res.anotaciones;
        }
        if (cit.form.alumnoId !== id) return;
        pintarAnotacionesCit(cit.anotacionesDe[id]);
      } catch (e) {
        if (e.message !== 'sesion') cont.innerHTML = '<p class="vacio">❌ ' + e.message + '</p>';
      }
    }
  }
  actualizarBarraCit();
}

function pintarAnotacionesCit(lista) {
  const cont = $('citAnotaciones');
  cont.innerHTML = '';
  if (!lista.length) {
    cont.innerHTML = '<p class="vacio">No tiene aspectos a mejorar en los últimos 30 días. Describe el motivo arriba.</p>';
    return;
  }
  lista.forEach((x) => {
    const lab = document.createElement('label');
    lab.className = 'anot-check';
    const ck = document.createElement('input');
    ck.type = 'checkbox';
    ck.checked = cit.form.anotaciones.has(x.id);
    ck.onchange = () => { ck.checked ? cit.form.anotaciones.add(x.id) : cit.form.anotaciones.delete(x.id); };
    const tx = document.createElement('div');
    tx.textContent = (x.gravedad === 'Grave' ? '🔴 ' : '📌 ') + x.texto;
    const sm = document.createElement('small');
    sm.textContent = x.detalle;
    tx.appendChild(sm);
    lab.append(ck, tx);
    cont.appendChild(lab);
  });
}

function faltaEnFormulario() {
  if (!cit.form.alumnoId) return 'Elige un alumno';
  if (!cit.form.motivo) return 'Elige el motivo';
  if (!$('citDetalle').value.trim()) return 'Escribe el detalle del motivo';
  if (!$('citFecha').value) return 'Elige la fecha';
  if ($('citFecha').value < hoyTexto()) return 'La fecha ya pasó';
  if (!$('citHora').value) return 'Elige la hora';
  return '';
}

function actualizarBarraCit() {
  const falta = faltaEnFormulario() || (cit.form.alumnoId && !datosListos() ? 'Cargando datos…' : '');
  const conCorreo = $('citCorreo').checked && !$('citCorreo').disabled;
  const a = alumnoElegido();
  const esCit = cit.form.tipo === 'Citación';
  $('btnCitContinuar').disabled = !!falta || !!cit.enviando;
  $('btnCitContinuar').textContent = cit.enviando ? 'Guardando…' : (conCorreo ? 'Vista previa' : 'Guardar citación');
  let resumen = conCorreo ? 'Listo: revisa el correo antes de enviar' : 'Se guardará sin enviar correo';
  if (!falta && esCit && !conCorreo) {
    resumen = a && a.celularDe ? 'Sin correo: envíala por WhatsApp después de guardar'
      : 'Sin correo ni celular: la citación no llegará por la app';
  }
  $('citResumen').textContent = falta || resumen;
}

function datosFormulario() {
  return {
    seccion: cit.seccion,
    alumnoId: cit.form.alumnoId,
    motivo: cit.form.motivo,
    detalle: $('citDetalle').value.trim(),
    anotaciones: Array.from(cit.form.anotaciones),
    fecha: $('citFecha').value,
    hora: $('citHora').value,
    modalidad: cit.form.modalidad,
    lugar: $('citLugar').value.trim(),
    tipo: cit.form.tipo,
    solicitadaPor: cit.form.solicitadaPor,
    enviarCorreo: $('citCorreo').checked && !$('citCorreo').disabled
  };
}

$('btnCitContinuar').onclick = async () => {
  if (faltaEnFormulario() || cit.enviando) return;
  const datos = datosFormulario();
  if (!datos.enviarCorreo) {
    const txt = datos.tipo === 'Citación'
      ? '¿Guardar la citación sin enviar correo?\nPodrás enviarla por WhatsApp después de guardar.'
      : '¿Guardar la citación sin enviar correo?\nRecuerda anotarla en la agenda del alumno.';
    if (confirm(txt)) guardarCitacion(datos);
    return;
  }
  // Vista previa del correo (usa la misma ventana que el Reporte)
  $('btnCitContinuar').disabled = true;
  try {
    const res = await api('vistaPreviaCitacion', datos);
    $('modalPara').textContent = res.para.join(', ');
    $('modalAsunto').textContent = res.asunto;
    $('modalMarco').srcdoc = res.html;
    $('modalEnviar').textContent = 'Guardar y enviar';
    enviarDesdeModal = () => guardarCitacion(datos);
    $('modal').classList.remove('oculto');
  } catch (e) {
    if (e.message !== 'sesion') aviso('❌ ' + e.message, true);
  } finally {
    actualizarBarraCit();
  }
};

async function guardarCitacion(datos) {
  cit.enviando = true;
  actualizarBarraCit();
  try {
    if (datos.lugar) guardarLocal('anec_citLugar', datos.lugar);
    const res = await api('guardarCitacion', datos);
    let msg = '✅ Citación guardada';
    if (datos.enviarCorreo) msg += res.correoEnviado ? ' y correo enviado' : ' (el correo no se pudo enviar: ' + res.errorCorreo + ')';
    if (res.whatsapp) msg += datos.tipo === 'Citación' ? '. Puedes enviarla también por WhatsApp.' : '. Puedes enviar el recordatorio por WhatsApp.';
    aviso(msg, datos.enviarCorreo && !res.correoEnviado);
    cit.abiertos.add(res.id); // se muestra abierta para el botón de WhatsApp
    mostrarListaCit();
    window.scrollTo(0, 0);
    await cargarCitaciones(true);
  } catch (e) {
    if (e.message !== 'sesion') aviso('❌ ' + e.message, true);
  } finally {
    cit.enviando = false;
    actualizarBarraCit();
  }
}
