/* inicio.js: arranque (debe cargarse al final) — Anecdotario · Colegio Proyecto */

/* ---------------- Arranque ---------------- */

(function () {
  $('correo').value = leerLocal('anec_correo') || '';
  const t = leerLocal('anec_token');
  if (t) {
    estado.token = t;
    $('login').classList.add('oculto');
    iniciar();
  }
})();
