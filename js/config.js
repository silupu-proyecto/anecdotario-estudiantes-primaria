/* config.js: URL de la API y estado compartido — Anecdotario · Colegio Proyecto */

/* 👉 Pega aquí la URL /exec de Apps Script */
const API_URL =
  "https://script.google.com/macros/s/AKfycbxVFIeZspYP0tkC5LNULkMA3T1i0xo3RruqeIUTSVST79DQgYfPFaPQCXaJw1_md5BuNg/exec";
const DOMINIO = "@colegioproyecto.com";

const $ = (id) => document.getElementById(id);
const estado = {
  token: null,
  docente: null,
  incidentes: [],
  seccion: null,
  alumnosPorSeccion: {},
  vista: "registrar",
  alumnos: [],
  seleccion: new Set(),
  tipo: "A mejorar",
  acciones: new Set(),
  guardando: false,
};
let ultimaSync = 0;
const MINUTOS_ENTRE_REVISIONES = 5;
