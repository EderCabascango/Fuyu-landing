// Tarjeta animada "antes → después" de Fuyu.
// Tres momentos en bucle: 1) le llega un pedido, 2) Fuyu lo lee, 3) listo para revisar.
// Los tallos, el resumen y los errores se calculan aquí a partir del ejemplo y del catálogo de la finca.
// Se usa igual en la portada (/) y en la demo (/demo).

const CATALOGO_URL = "/demo/catalogo.json";

const miles = (n) => Number(n).toLocaleString("es-EC");
const dinero = (n) => `$${Number(n).toFixed(2).replace(".", ",")}`;
const normal = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// ---------- Cálculos ----------

function calcular(ejemplo, catalogo) {
  const filas = ejemplo.lineas.filter((l) => l.fila).map((l) => {
    const f = l.fila;
    const tallos = f.cajas * f.bonches * f.tallosBonche;
    const enCatalogo = catalogo.variedades.some((v) => normal(v.nombre) === normal(f.variedad));
    const problemas = [];
    if (!enCatalogo) problemas.push({ nivel: "error", campo: "variedad", texto: `${f.variedad} no está en su catálogo` });
    if (f.declarado != null && f.declarado !== tallos)
      problemas.push({ nivel: "error", campo: "tallos", texto: `${f.variedad}: ${f.cajas} cajas dan ${miles(tallos)} tallos, pero el pedido dice ${miles(f.declarado)}` });
    if (f.precio == null) problemas.push({ nivel: "aviso", campo: "precio", texto: `${f.variedad} ${f.largo}: el cliente no dijo el precio` });
    return { ...f, tallos, problemas };
  });
  const variedades = new Set(filas.map((f) => normal(f.variedad))).size;
  const tallos = filas.reduce((s, f) => s + f.tallos, 0);
  const problemas = filas.flatMap((f) => f.problemas);
  const errores = problemas.filter((p) => p.nivel === "error").length;
  return { filas, variedades, tallos, problemas, errores };
}

function tituloProblemas(calc) {
  const n = calc.problemas.length;
  if (!n) return "Todo cuadra con su catálogo";
  if (calc.errores) return `Encontró ${calc.errores} ${calc.errores === 1 ? "error" : "errores"} antes de que lleguen al despacho`;
  return `${n} ${n === 1 ? "cosa" : "cosas"} para revisar antes de cargar`;
}

// ---------- Piezas visuales ----------

function vistaMensaje(ejemplo) {
  if (ejemplo.tipo === "chat") {
    const caja = el("div", "ad-chat");
    const cab = el("div", "ad-chat-cab");
    cab.append(el("span", "ad-chat-avatar", ejemplo.contacto.slice(0, 1)), el("span", "ad-chat-nombre", ejemplo.contacto));
    const cuerpo = el("div", "ad-chat-cuerpo");
    for (const l of ejemplo.lineas) {
      const b = el("p", "ad-linea ad-burbuja");
      b.append(document.createTextNode(l.texto), el("span", "ad-hora", l.hora || ""));
      cuerpo.append(b);
    }
    caja.append(cab, cuerpo);
    return caja;
  }
  const caja = el("div", "ad-correo");
  const cab = el("div", "ad-correo-cab");
  cab.append(el("p", "ad-correo-asunto", ejemplo.asunto), el("p", "ad-correo-de", `De: ${ejemplo.de}`));
  const cuerpo = el("div", "ad-correo-cuerpo");
  for (const l of ejemplo.lineas) cuerpo.append(el("p", "ad-linea", l.texto));
  caja.append(cab, cuerpo);
  return caja;
}

const COLUMNAS = {
  variedad: { titulo: "Variedad", valor: (f, cols) => (cols.includes("largo") ? f.variedad : `${f.variedad} ${f.largo} cm`), campo: "variedad" },
  largo: { titulo: "Largo", valor: (f) => `${f.largo} cm` },
  cajas: { titulo: "Cajas", valor: (f) => `${f.cajas} ${f.tipo}` },
  tallos: { titulo: "Tallos", valor: (f) => miles(f.tallos), campo: "tallos" },
  precio: { titulo: "Precio", valor: (f) => (f.precio == null ? "revisar" : dinero(f.precio)), campo: "precio" },
};

function tabla(calc, columnas, { ocultas = false } = {}) {
  const t = el("table", "ad-tabla");
  const thead = el("thead");
  const trh = el("tr");
  for (const c of columnas) trh.append(el("th", c === "variedad" ? "" : "ad-num", COLUMNAS[c].titulo));
  thead.append(trh);
  const tbody = el("tbody");
  for (const f of calc.filas) {
    const tr = el("tr", ocultas ? "ad-fila" : "ad-fila ver");
    if (f.problemas.some((p) => p.nivel === "error")) tr.classList.add("ad-fila-error");
    for (const c of columnas) {
      const def = COLUMNAS[c];
      const td = el("td", c === "variedad" ? "" : "ad-num", def.valor(f, columnas));
      const p = f.problemas.find((x) => x.campo === def.campo);
      if (p) td.classList.add(p.nivel === "error" ? "ad-celda-error" : "ad-celda-aviso");
      tr.append(td);
    }
    tbody.append(tr);
  }
  t.append(thead, tbody);
  return t;
}

// ---------- Montaje y animación ----------

export async function montarAntesDespues(raiz, ejemplo, opciones = {}) {
  const {
    etiqueta = "Ejemplo con datos ficticios",
    columnas = ["variedad", "cajas", "tallos", "precio"],
    enlace = null,
    tiempos = { linea: 550, lectura: 700, pausaLectura: 600, resultado: 4200 },
  } = opciones;

  let catalogo;
  try {
    catalogo = await fetch(CATALOGO_URL).then((r) => r.json());
  } catch {
    catalogo = { variedades: [] };
  }
  const calc = calcular(ejemplo, catalogo);

  raiz.classList.add("ad");
  raiz.innerHTML = "";

  // Cabecera: etiqueta y los tres momentos
  const cab = el("div", "ad-cab");
  const pasos = el("ol", "ad-pasos");
  ["Le llega un pedido", "Fuyu lo lee", "Listo para revisar"].forEach((t, i) => {
    const li = el("li", "", t);
    li.dataset.m = String(i + 1);
    pasos.append(li);
  });
  cab.append(pasos, el("span", "ad-etiqueta", etiqueta));

  const escena = el("div", "ad-escena");

  // Momento 1
  const m1 = el("div", "ad-m ad-m1");
  m1.append(vistaMensaje(ejemplo));

  // Momento 2
  const m2 = el("div", "ad-m ad-m2");
  const leyendo = el("p", "ad-leyendo", "Fuyu está leyendo…");
  const lineasMini = el("div", "ad-mini");
  for (const l of ejemplo.lineas) lineasMini.append(el("p", "ad-mini-linea", l.texto));
  const tabla2 = tabla(calc, columnas, { ocultas: true });
  tabla2.classList.add("ad-tabla-lectura");
  m2.append(leyendo, lineasMini, tabla2);

  // Momento 3
  const m3 = el("div", "ad-m ad-m3");
  const resumen = el("p", "ad-resumen");
  resumen.append(el("strong", "", ejemplo.cliente));
  resumen.append(document.createTextNode(` · entrega ${ejemplo.entrega} · ${calc.variedades} ${calc.variedades === 1 ? "variedad" : "variedades"} · ${miles(calc.tallos)} tallos`));
  const bloque = el("div", calc.errores ? "ad-problemas ad-problemas-error" : "ad-problemas");
  bloque.append(el("p", "ad-problemas-titulo", tituloProblemas(calc)));
  const lista = el("ul", "ad-avisos");
  for (const p of calc.problemas) lista.append(el("li", p.nivel === "error" ? "ad-aviso ad-aviso-error" : "ad-aviso", p.texto));
  bloque.append(lista);
  m3.append(resumen, tabla(calc, columnas), bloque);
  if (enlace) {
    const a = el("a", "ad-enlace", enlace.texto);
    a.href = enlace.href;
    m3.append(a);
  }

  escena.append(m1, m2, m3);
  raiz.append(cab, escena);

  const lineas1 = [...m1.querySelectorAll(".ad-linea")];
  const lineas2 = [...lineasMini.children];
  const filas2 = [...tabla2.querySelectorAll(".ad-fila")];

  const ponerMomento = (n) => {
    raiz.dataset.momento = String(n);
    pasos.querySelectorAll("li").forEach((li) => li.classList.toggle("activo", Number(li.dataset.m) === n));
  };

  const reiniciar = () => {
    lineas1.forEach((x) => x.classList.remove("ver"));
    lineas2.forEach((x) => x.classList.remove("leida", "leyendo"));
    filas2.forEach((x) => x.classList.remove("ver"));
  };

  // Momento fijo: con "reducir movimiento" o con ?momento=N en la dirección (para capturas)
  const fijo = Number(new URLSearchParams(location.search).get("momento")) || null;
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (quieto || fijo) {
    const n = fijo && fijo >= 1 && fijo <= 3 ? fijo : 3;
    lineas1.forEach((x) => x.classList.add("ver"));
    lineas2.forEach((x) => x.classList.add("leida"));
    filas2.forEach((x) => x.classList.add("ver"));
    ponerMomento(n);
    return;
  }

  let visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(raiz);
  }
  const esperarVisible = async () => { while (!visible || document.hidden) await espera(400); };

  // Índice de la fila que produce cada línea (las líneas sin fila no agregan nada)
  let k = 0;
  const filaDeLinea = ejemplo.lineas.map((l) => (l.fila ? k++ : null));

  for (;;) {
    await esperarVisible();
    reiniciar();
    ponerMomento(1);
    await espera(300);
    for (const x of lineas1) { x.classList.add("ver"); await espera(tiempos.linea); }
    await espera(700);

    ponerMomento(2);
    await espera(tiempos.pausaLectura);
    for (let i = 0; i < lineas2.length; i++) {
      lineas2[i].classList.add("leyendo");
      await espera(tiempos.lectura * 0.5);
      if (filaDeLinea[i] !== null) filas2[filaDeLinea[i]].classList.add("ver");
      await espera(tiempos.lectura * 0.5);
      lineas2[i].classList.replace("leyendo", "leida");
    }
    await espera(500);

    ponerMomento(3);
    await espera(tiempos.resultado);
  }
}

// ---------- Ejemplos (datos ficticios) ----------

export const EJEMPLO_CORREO_ERRORES = {
  tipo: "correo",
  asunto: "Order SF-2290 for Dec 2",
  de: "Jennifer Liu · Sunrise Floral, Toronto",
  cliente: "Sunrise Floral",
  entrega: "2 dic",
  lineas: [
    { texto: "Freedom 60 cm · 8 HB · $0.48", fila: { variedad: "Freedom", largo: 60, cajas: 8, tipo: "HB", bonches: 10, tallosBonche: 25, precio: 0.48 } },
    { texto: "Pink Moonlight 50 cm · 4 QB · $0.50", fila: { variedad: "Pink Moonlight", largo: 50, cajas: 4, tipo: "QB", bonches: 5, tallosBonche: 25, precio: 0.5 } },
    { texto: "Explorer 70 cm · 6 HB · 1,400 stems · $0.60", fila: { variedad: "Explorer", largo: 70, cajas: 6, tipo: "HB", bonches: 8, tallosBonche: 25, declarado: 1400, precio: 0.6 } },
    { texto: "Mondial 60 cm · 3 QB · $0.44", fila: { variedad: "Mondial", largo: 60, cajas: 3, tipo: "QB", bonches: 5, tallosBonche: 25, precio: 0.44 } },
  ],
};

export const EJEMPLO_WHATSAPP = {
  tipo: "chat",
  contacto: "Andrés · Floristería Los Andes",
  cliente: "Floristería Los Andes",
  entrega: "sáb 21 nov",
  lineas: [
    { texto: "Buenos días 🌹 para el sábado 21 porfa", hora: "08:14", fila: null },
    { texto: "6 HB freedom 50 a 0.30", hora: "08:15", fila: { variedad: "Freedom", largo: 50, cajas: 6, tipo: "HB", bonches: 10, tallosBonche: 25, precio: 0.3 } },
    { texto: "3 qb playa blanca 40 a 0.28", hora: "08:17", fila: { variedad: "Playa Blanca", largo: 40, cajas: 3, tipo: "QB", bonches: 5, tallosBonche: 25, precio: 0.28 } },
    { texto: "y 2 qb vendela 60", hora: "08:17", fila: { variedad: "Vendela", largo: 60, cajas: 2, tipo: "QB", bonches: 5, tallosBonche: 25, precio: null } },
  ],
};
