// =========================================================
// REAPER — NO TE ABURRAS
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  const anioSpan = document.getElementById("anio");
  if (anioSpan) {
    anioSpan.textContent = new Date().getFullYear();
  }

  document.querySelectorAll(".btn-juego:not([disabled]), .btn-volver").forEach((el) => {
    el.addEventListener("click", (e) => {
      const href = el.getAttribute("href");
      if (href) {
        e.preventDefault();
        reproducirClic();
        setTimeout(() => { window.location.href = href; }, 160);
      } else {
        reproducirClic();
      }
    });
  });

  if (document.getElementById("selector-modo")) {
    initJuegoPapasLouie();
  }
});

/* =========================================================
   SONIDO DE CLIC (sintetizado, no usa archivos externos)
   ========================================================= */
let audioCtx = null;

function reproducirClic() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(520, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.16);
  } catch (e) {
    // Si el navegador bloquea audio, no pasa nada, seguimos sin sonido aunque re gil no aceptando audio.
  }
}

/* =========================================================
   JUEGO: ¿QUIEN SOY? PAPA'S LOUIE — MÓDULO 2 JUGADORES
   ========================================================= */

/* =========================================================
   CONEXIÓN ENTRE PCs (Firebase Realtime Database)
   =========================================================
   Antes esto usaba localStorage, que SOLO funciona dentro del
   mismo navegador — por eso dos PCs en redes distintas nunca
   se veían entre sí. Ahora las "salas" viven en una base de
   datos en la nube, así que cualquier PC que entre a la misma
   URL puede leer/escribir la misma sala.

   Pegá acá los datos que te da Firebase (Configuración del
   proyecto > Tus apps > app Web). Sin esto no va a andar.
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyDLxEpqxKjWV0ldGvFey9nvuJ8aVqUA0VM",
  authDomain: "reaper-minijuegos.firebaseapp.com",
  databaseURL: "https://reaper-minijuegos-default-rtdb.firebaseio.com",
  projectId: "reaper-minijuegos",
  storageBucket: "reaper-minijuegos.firebasestorage.app",
  messagingSenderId: "1071002365800",
  appId: "1:1071002365800:web:35b457b413ea1e9fc230dd",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Cada página de juego declara su nombre en <body data-juego="...">.
// Así las salas de Papa's Louie, Pokémon, etc. viven en ramas separadas
// dentro de la misma base: salas/papas-louie/ABC123, salas/pokemon/XYZ789.
// Si una página no declara data-juego, cae en "general".
const JUEGO_ACTUAL = document.body.dataset.juego || "general";

// Un ID al azar por pestaña abierta, para identificar "soy yo" dentro
// de la lista de jugadores de una sala (no es un login, es solo para
// que Firebase sepa quién sigue presente y quién no).
function idJugador() {
  if (!window.__idJugador) {
    window.__idJugador = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
  }
  return window.__idJugador;
}

function refSala(codigo) {
  return db.ref(`salas/${JUEGO_ACTUAL}/${codigo}`);
}

// Me anoto como jugador presente en la sala y le pido a Firebase que,
// si mi pestaña se cierra o pierdo la conexión, me borre solo — sin
// que yo tenga que hacer nada. Cuando la lista de jugadores de la
// sala queda en cero (los dos se fueron), borramos la sala entera.
function unirseComoJugador(codigo) {
  const miPresencia = refSala(codigo).child("jugadores").child(idJugador());
  miPresencia.set(true);
  miPresencia.onDisconnect().remove();

  refSala(codigo).child("jugadores").on("value", (snap) => {
    if (!snap.exists() || snap.numChildren() === 0) {
      refSala(codigo).remove();
    }
  });
}

// Barrido de salas viejas y abandonadas (por si los dos jugadores se
// desconectaron a la vez y nadie quedó para disparar el borrado de
// arriba). Se ejecuta cada vez que alguien crea una sala nueva, así
// no hace falta un servidor aparte corriendo todo el tiempo.
const VIDA_MAXIMA_SALA_MS = 3 * 60 * 60 * 1000; // 3 horas

async function limpiarSalasViejas() {
  const snap = await db.ref(`salas/${JUEGO_ACTUAL}`).get();
  if (!snap.exists()) return;
  const ahora = Date.now();
  const borrados = [];
  snap.forEach((hijo) => {
    const datos = hijo.val();
    if (!datos || !datos.creado || ahora - datos.creado > VIDA_MAXIMA_SALA_MS) {
      borrados.push(db.ref(`salas/${JUEGO_ACTUAL}/${hijo.key}`).remove());
    }
  });
  return Promise.all(borrados);
}

// Un personaje por entrada: nombre + UNA sola imagen + ajustes opcionales
// de encuadre para el cuadradito de la grilla:
//   zoom -> acerca la foto (1 = sin zoom). Probá de a 0.1.
//   x    -> mueve la foto a los costados. Negativo = izquierda, positivo = derecha.
//   y    -> mueve la foto arriba/abajo. Negativo = arriba, positivo = abajo.
// Los tres son opcionales, se pueden usar en cualquier combinación, por
// ejemplo: { nombre: "Cooper", img: "...", zoom: 1.6, x: -5, y: 10 }
// (eso significa: acercar, correr un poco a la izquierda y bajar un poco).
// Nada de esto toca la foto completa de la pantalla de selección.
//
// El mismo archivo se usa recortado (cara, cuadrado) en la grilla
// y completo (sin recortar) en la pantalla de selección — el recorte
// lo hace el CSS, no hace falta subir dos fotos por personaje.
//
// Para sumar/editar personajes: agregá o cambiá una línea acá.
// Si el link es de una página de la wiki y no de la imagen directa,
// no va a cargar — necesitás la URL que empieza con
// "static.wikia.nocookie.net/.../images/...png".
const PERSONAJES = [
  { nombre: "Papa Louie", img: "https://static.wikia.nocookie.net/scratchpad/images/c/c5/Papa_Louie_Style_B.png/revision/latest?cb=20200809203507" },
  { nombre: "Roy",        img: "https://static.wikia.nocookie.net/scratchpad/images/e/ee/Roy_Original.png/revision/latest?cb=20200809203515" },
  { nombre: "Mandic",        img: "https://static.wikia.nocookie.net/scratchpad/images/f/fa/Mandic.png/revision/latest?cb=20200809205424" },
  { nombre: "Big Pauly",  img: "https://static.wikia.nocookie.net/scratchpad/images/d/de/Big_pauly.png/revision/latest?cb=20200809203630" },
  { nombre: "Penny",      img: "https://static.wikia.nocookie.net/scratchpad/images/2/27/Penny_%28Papa_Louie%29.png/revision/latest?cb=20200809203800", zoom: 1.5, x: 6, y: 0 },
  { nombre: "Captain Cory",      img: "https://static.wikia.nocookie.net/scratchpad/images/d/d4/CaptainCori.png/revision/latest?cb=20200809211332", zoom: 1.5, x: 6, y: 0 },
  { nombre: "Wally",      img: "https://static.wikia.nocookie.net/scratchpad/images/2/2c/Wally_Original.png/revision/latest?cb=20200809204105", zoom: 1, x: 0, y: 0},
  { nombre: "Kahuna",    img: "https://static.wikia.nocookie.net/scratchpad/images/0/06/KahunaO.png/revision/latest?cb=20200809211325" },
  { nombre: "Foodini",      img: "https://static.wikia.nocookie.net/scratchpad/images/1/10/Foodini.png/revision/latest?cb=20200809211616" },
  { nombre: "Chuck",      img: "https://static.wikia.nocookie.net/scratchpad/images/8/87/Chuck.png/revision/latest?cb=20241109170819" },
  { nombre: "Allan",  img: "https://static.wikia.nocookie.net/scratchpad/images/0/01/Allan.png/revision/latest?cb=20200809203742" },
  { nombre: "Rita",      img: "https://static.wikia.nocookie.net/scratchpad/images/3/32/Rita.png/revision/latest?cb=20200809204118" },
  { nombre: "Mary",     img: "https://static.wikia.nocookie.net/scratchpad/images/b/be/MaryCleany.png/revision/latest?cb=20200809204204" },
  { nombre: "Franco",      img: "https://static.wikia.nocookie.net/scratchpad/images/4/48/Franco.png/revision/latest?cb=20200809205452" },
  { nombre: "Prudence",     img: "https://static.wikia.nocookie.net/scratchpad/images/e/ef/Prudence.png/revision/latest?cb=20200809204211" },
  { nombre: "Mindy",      img: "https://static.wikia.nocookie.net/scratchpad/images/a/ac/Mindy_%28Papa_Louie%29.png/revision/latest?cb=20200809203647" },
  { nombre: "Olga",     img: "https://static.wikia.nocookie.net/scratchpad/images/f/ff/Olga.png/revision/latest?cb=20200809205446" },
  { nombre: "Taylor",     img: "https://static.wikia.nocookie.net/scratchpad/images/a/ac/Taylor.png/revision/latest?cb=20180912165526", zoom: 1, x: 0, y: 0 },
  { nombre: "Tohru",       img: "https://static.wikia.nocookie.net/scratchpad/images/d/de/Tohru.png/revision/latest?cb=20200809205458" },
  { nombre: "Clover",     img: "https://static.wikia.nocookie.net/scratchpad/images/c/c4/Clover.png/revision/latest?cb=20200809205516" },
  { nombre: "Cooper",     img: "https://static.wikia.nocookie.net/scratchpad/images/1/12/Cooper.png/revision/latest?cb=20200809203929", zoom: 1.4, x: 6, y: 0 },
  { nombre: "Hugo",    img: "https://static.wikia.nocookie.net/scratchpad/images/0/02/Hugo.png/revision/latest?cb=20200809205524" },
  { nombre: "Peggy",img: "https://static.wikia.nocookie.net/scratchpad/images/8/88/Peggy.png/revision/latest?cb=20200809205530" },
  { nombre: "Sarge Fan",        img: "https://static.wikia.nocookie.net/scratchpad/images/f/f1/Sarge_fan.png/revision/latest?cb=20200809205600" },
  { nombre: "Marty",      img: "https://static.wikia.nocookie.net/scratchpad/images/4/4c/Marty.png/revision/latest?cb=20200809204057" },
];

function initJuegoPapasLouie() {
  const selectorModo = document.getElementById("selector-modo");
  const pantallaRol = document.getElementById("pantalla-rol");
  const pantallaUnirse = document.getElementById("pantalla-unirse");
  const bloqueJugador = document.getElementById("bloque-jugador");
  const etiquetaJugador = document.getElementById("etiqueta-jugador");
  const codigoHostBox = document.getElementById("codigo-host");
  const codigoGrande = document.getElementById("codigo-grande");
  const estadoConexion = document.getElementById("estado-conexion");
  const inputCodigo = document.getElementById("input-codigo");
  const mensajeError = document.getElementById("mensaje-error");
  const mensajeSeleccion = document.getElementById("mensaje-seleccion");
  const panelSeleccion = document.getElementById("panel-seleccion");
  const fotoSeleccion = document.getElementById("foto-seleccion");
  const nombreSeleccion = document.getElementById("nombre-seleccion");
  const btnConfirmar = document.getElementById("btn-confirmar");
  const btnCancelar = document.getElementById("btn-cancelar");
  const grilla = document.getElementById("grilla");

  const btn2j = document.getElementById("btn-2j");
  const btnHost = document.getElementById("btn-host");
  const btnUnirse = document.getElementById("btn-unirse");
  const btnConectar = document.getElementById("btn-conectar");

  // "seleccion" = eligiendo tu identidad todavía / "juego" = ya podés activar-desactivar
  let modoJuego = "seleccion";
  let celdaEnRevision = null;

  // Paso 1 -> Paso 2
  btn2j.addEventListener("click", () => {
    selectorModo.classList.add("oculto");
    pantallaRol.classList.remove("oculto");
  });

  // Paso 2: elegir Host
  btnHost.addEventListener("click", async () => {
    limpiarSalasViejas(); // no bloquea, corre en segundo plano
    const codigo = generarCodigo();
    await guardarSala(codigo, { creado: Date.now(), conectado: false });
    unirseComoJugador(codigo);
    mostrarBloqueJugador({ esHost: true, numeroJugador: 1, codigo });
    escucharConexionSala(codigo, estadoConexion, () => iniciarFaseSeleccion());
  });

  // Paso 2: elegir Unirse
  btnUnirse.addEventListener("click", () => {
    pantallaRol.classList.add("oculto");
    pantallaUnirse.classList.remove("oculto");
    inputCodigo.focus();
  });

  // Paso 2b: conectar con código
  btnConectar.addEventListener("click", async () => {
    const codigo = inputCodigo.value.trim().toUpperCase();

    if (!codigo) {
      mensajeError.classList.remove("oculto");
      return;
    }

    btnConectar.disabled = true;
    const sala = await leerSala(codigo);
    btnConectar.disabled = false;

    if (!sala) {
      mensajeError.classList.remove("oculto");
      return;
    }

    mensajeError.classList.add("oculto");
    await marcarSalaConectada(codigo);
    unirseComoJugador(codigo);

    mostrarBloqueJugador({ esHost: false, numeroJugador: 2, codigo });
    iniciarFaseSeleccion();
  });

  inputCodigo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnConectar.click();
  });

  // Confirmar identidad elegida (tick verde)
  btnConfirmar.addEventListener("click", () => {
    if (!celdaEnRevision) return;
    celdaEnRevision.classList.add("elegido");
    cerrarPanelSeleccion();
    modoJuego = "juego";
    mensajeSeleccion.classList.add("oculto");
    celdaEnRevision = null;
  });

  // Cancelar y elegir otra (x roja)
  btnCancelar.addEventListener("click", () => {
    cerrarPanelSeleccion();
    celdaEnRevision = null;
  });

  function cerrarPanelSeleccion() {
    panelSeleccion.classList.add("oculto");
  }

  function mostrarBloqueJugador({ esHost, numeroJugador, codigo }) {
    selectorModo.classList.add("oculto");
    pantallaRol.classList.add("oculto");
    pantallaUnirse.classList.add("oculto");
    bloqueJugador.classList.remove("oculto");

    etiquetaJugador.textContent = `Jugador #${numeroJugador}`;

    if (esHost) {
      codigoHostBox.classList.remove("oculto");
      codigoGrande.textContent = codigo;
    } else {
      codigoHostBox.classList.add("oculto");
    }

    generarGrilla(grilla, (celda, indice) => {
      if (modoJuego === "seleccion") {
        abrirPanelSeleccion(celda, indice);
      } else {
        celda.classList.toggle("descartado");
      }
    });
  }

  function iniciarFaseSeleccion() {
    modoJuego = "seleccion";
    mensajeSeleccion.classList.remove("oculto");
    grilla.classList.remove("oculto");
  }

  function abrirPanelSeleccion(celda, indice) {
    celdaEnRevision = celda;
    const personaje = PERSONAJES[indice];
    fotoSeleccion.src = personaje.img;
    fotoSeleccion.alt = personaje.nombre;
    nombreSeleccion.textContent = personaje.nombre;
    panelSeleccion.classList.remove("oculto");
    panelSeleccion.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function generarCodigo() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 6; i++) {
    codigo += chars[Math.floor(Math.random() * chars.length)];
  }
  return codigo;
}

function guardarSala(codigo, datos) {
  return refSala(codigo).set(datos);
}

async function leerSala(codigo) {
  const snap = await refSala(codigo).get();
  return snap.exists() ? snap.val() : null;
}

function marcarSalaConectada(codigo) {
  return refSala(codigo).child("conectado").set(true);
}

function escucharConexionSala(codigo, estadoConexionEl, alConectar) {
  const ref = refSala(codigo).child("conectado");
  ref.on("value", (snap) => {
    if (snap.val() === true) {
      estadoConexionEl.textContent = "¡Jugador #2 conectado!";
      estadoConexionEl.classList.add("conectado");
      ref.off();
      if (typeof alConectar === "function") alConectar();
    }
  });
}

/* --- Grilla de personajes --- */

function generarGrilla(contenedor, alHacerClic) {
  contenedor.innerHTML = "";

  PERSONAJES.forEach((personaje, indice) => {
    const celda = document.createElement("button");
    celda.type = "button";
    celda.className = "celda-personaje";
    celda.setAttribute("aria-label", personaje.nombre);

    const img = document.createElement("img");
    img.src = personaje.img;
    img.alt = personaje.nombre;
    img.loading = "lazy";
    img.style.setProperty("--zoom", personaje.zoom || 1);
    img.style.setProperty("--x", (personaje.x || 0) + "%");
    img.style.setProperty("--y", (personaje.y || 0) + "%");

    celda.appendChild(img);

    celda.addEventListener("click", () => {
      reproducirClic();
      alHacerClic(celda, indice);
    });

    contenedor.appendChild(celda);
  });
}
