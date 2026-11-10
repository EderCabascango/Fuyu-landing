import { validarPedido, validarFactura, totalTallosCalculado } from "./validaciones.js";

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PAGINAS_IMAGEN = 3;

const EJEMPLOS = {
  pedido: [
    { archivo: "pedido_correo_ingles.txt", formato: "CORREO", titulo: "Correo en inglés", detalle: "Importador de Miami, EE. UU." },
    { archivo: "pedido_tabla.pdf", formato: "PDF", titulo: "Orden de compra en PDF", detalle: "Importador de Moscú, tabla por variedad" },
    { archivo: "pedido_excel.xlsx", formato: "EXCEL", titulo: "Pedido en Excel", detalle: "Mayorista de Países Bajos" },
    { archivo: "pedido_whatsapp.txt", formato: "WHATSAPP", titulo: "WhatsApp desordenado", detalle: "Varios mensajes, con abreviaturas" },
    { archivo: "pedido_con_errores.txt", formato: "CORREO", titulo: "Pedido con errores", detalle: "Una variedad que no existe y una suma mal hecha", error: true },
  ],
  factura: [
    { archivo: "factura_cartonera.pdf", formato: "PDF", titulo: "Factura de cartón", detalle: "Correcta, sin diferencias" },
    { archivo: "factura_insumos_total_mal.pdf", formato: "PDF", titulo: "Factura de insumos", detalle: "Con el total mal calculado", error: true },
    { archivo: "factura_frio_escaneada.pdf", formato: "ESCANEO", titulo: "Factura escaneada", detalle: "Servicio técnico, documento en papel" },
  ],
};

const CAMPOS = {
  pedido: {
    cabecera: [
      { k: "cliente", e: "Cliente" },
      { k: "numero_pedido", e: "N.º de pedido" },
      { k: "fecha_entrega", e: "Fecha de entrega", ph: "AAAA-MM-DD" },
      { k: "mercado", e: "Mercado" },
    ],
    linea: [
      { k: "variedad", e: "Variedad", ancho: true },
      { k: "largo_cm", e: "Largo (cm)", n: true },
      { k: "cajas", e: "Cajas", n: true },
      { k: "tipo_caja", e: "Tipo de caja" },
      { k: "bonches_por_caja", e: "Bonches por caja", n: true },
      { k: "tallos_por_bonche", e: "Tallos por bonche", n: true },
      { k: "total_tallos_declarado", e: "Tallos según pedido", n: true },
      { k: "_calculado", e: "Tallos calculados", calc: (l) => fmtEntero(totalTallosCalculado(l)) },
      { k: "precio_tallo", e: "Precio por tallo", n: true },
    ],
    columnas: "1.6fr .7fr .6fr .7fr .8fr .8fr .9fr .9fr .8fr 32px",
    nuevaLinea: () => ({ variedad: "", largo_cm: "", cajas: "", tipo_caja: "", bonches_por_caja: "", tallos_por_bonche: "25", total_tallos_declarado: "", precio_tallo: "", notas: "" }),
  },
  factura: {
    cabecera: [
      { k: "proveedor", e: "Proveedor" },
      { k: "ruc", e: "RUC" },
      { k: "numero_factura", e: "N.º de factura" },
      { k: "fecha", e: "Fecha", ph: "AAAA-MM-DD" },
    ],
    linea: [
      { k: "descripcion", e: "Descripción", ancho: true },
      { k: "cantidad", e: "Cantidad", n: true },
      { k: "precio_unitario", e: "Precio unitario", n: true },
      { k: "subtotal_linea", e: "Valor", n: true },
    ],
    totales: [
      { k: "subtotal", e: "Subtotal" },
      { k: "tarifa_iva", e: "IVA (%)" },
      { k: "iva", e: "IVA ($)" },
      { k: "total", e: "Total" },
    ],
    columnas: "3fr 1fr 1fr 1fr 32px",
    nuevaLinea: () => ({ descripcion: "", cantidad: "", precio_unitario: "", subtotal_linea: "" }),
  },
};

// ---------------- Estado ----------------

const estado = { modo: "pedido", datos: null, catalogo: null, aprobado: false, nombreDoc: "" };
const $ = (s) => document.querySelector(s);

const fmtEntero = (n) => (n === null || n === undefined || isNaN(n) ? "—" : Number(n).toLocaleString("es-EC"));
const num = (v) => (v === null || v === undefined || String(v).trim() === "" ? null : Number(String(v).replace(",", ".")));
const aTexto = (v) => (v === null || v === undefined ? "" : String(v));

function mensaje(texto, tipo = "") {
  const el = $("#estado");
  el.textContent = texto;
  el.className = `estado ${tipo}`;
}

// ---------------- Inicio ----------------

async function iniciar() {
  estado.catalogo = await fetch("catalogo.json").then((r) => r.json());
  document.querySelectorAll(".modo").forEach((b) => b.addEventListener("click", () => cambiarModo(b.dataset.modo)));
  $("#archivo").addEventListener("change", (e) => {
    const f = e.target.files[0];
    $("#nombre-archivo").textContent = f ? f.name : "PDF, Excel o foto · máximo 2 MB";
  });
  $("#btn-leer").addEventListener("click", leerPropio);
  $("#btn-aprobar").addEventListener("click", aprobar);
  $("#btn-excel").addEventListener("click", () => descargar("xlsx"));
  $("#btn-csv").addEventListener("click", () => descargar("csv"));
  pintarEjemplos();

  // Enlace directo a un ejemplo: /demo/?ejemplo=pedido_con_errores.txt
  const pedido = new URLSearchParams(location.search).get("ejemplo");
  if (pedido) {
    const modo = Object.keys(EJEMPLOS).find((m) => EJEMPLOS[m].some((e) => e.archivo === pedido));
    if (modo) {
      cambiarModo(modo);
      leerEjemplo(EJEMPLOS[modo].find((e) => e.archivo === pedido)).then(() => {
        if (new URLSearchParams(location.search).has("original")) $("#original").open = true;
      });
    }
  }
}

function cambiarModo(modo) {
  if (modo === estado.modo) return;
  estado.modo = modo;
  document.querySelectorAll(".modo").forEach((b) => {
    const activo = b.dataset.modo === modo;
    b.classList.toggle("activo", activo);
    b.setAttribute("aria-selected", activo);
  });
  $("#bloque-texto").classList.toggle("oculto", modo === "factura");
  $("#archivo").value = "";
  $("#nombre-archivo").textContent = "PDF, Excel o foto · máximo 2 MB";
  $("#paso-2").classList.add("oculto");
  $("#paso-3").classList.add("oculto");
  mensaje("");
  pintarEjemplos();
}

function pintarEjemplos() {
  const cont = $("#ejemplos");
  cont.innerHTML = "";
  for (const ej of EJEMPLOS[estado.modo]) {
    const b = document.createElement("button");
    b.className = "ejemplo";
    b.innerHTML = `<span class="formato"></span><span class="ejemplo-texto"><strong></strong><span></span></span>`;
    b.querySelector(".formato").textContent = ej.formato;
    b.querySelector("strong").textContent = ej.titulo;
    const det = b.querySelector(".ejemplo-texto span");
    det.textContent = ej.detalle;
    if (ej.error) det.classList.add("marca-error");
    b.addEventListener("click", () => leerEjemplo(ej));
    cont.appendChild(b);
  }
}

function bloquear(si) {
  document.querySelectorAll(".ejemplo, #btn-leer, .modo").forEach((b) => (b.disabled = si));
  if (si) {
    // Un documento nuevo reemplaza la revisión anterior
    $("#paso-2").classList.add("oculto");
    $("#paso-3").classList.add("oculto");
  }
}

// ---------------- Lectura de archivos en el navegador ----------------

async function leerEjemplo(ej) {
  try {
    bloquear(true);
    mensaje("Abriendo el ejemplo…", "cargando");
    const r = await fetch(`ejemplos/${ej.archivo}`);
    if (!r.ok) throw new Error("No se pudo abrir el ejemplo.");
    const blob = await r.blob();
    const archivo = new File([blob], ej.archivo, { type: blob.type });
    await procesarArchivo(archivo, `ejemplos/${ej.archivo}`);
  } catch (e) {
    mensaje(e.message, "error");
  } finally {
    bloquear(false);
  }
}

async function leerPropio() {
  const archivo = $("#archivo").files[0];
  const texto = estado.modo === "pedido" ? $("#texto").value.trim() : "";
  try {
    bloquear(true);
    if (archivo) await procesarArchivo(archivo, null);
    else if (texto) {
      estado.nombreDoc = "texto pegado";
      await enviar({ texto }, { tipo: "texto", contenido: texto });
    } else mensaje(estado.modo === "pedido" ? "Pegue un texto o elija un archivo." : "Elija un PDF o una foto de la factura.", "error");
  } catch (e) {
    mensaje(e.message, "error");
  } finally {
    bloquear(false);
  }
}

async function procesarArchivo(archivo, enlace) {
  if (archivo.size > MAX_BYTES) throw new Error("El archivo pesa más de 2 MB. Pruebe con uno más liviano.");
  estado.nombreDoc = archivo.name;
  const nombre = archivo.name.toLowerCase();
  mensaje("Leyendo el documento…", "cargando");

  if (nombre.endsWith(".pdf")) {
    const { texto, imagenes } = await leerPDF(archivo);
    if (imagenes) return enviar({ imagenes }, { tipo: "imagenes", contenido: imagenes, enlace, nota: "Documento escaneado: se lee como imagen." });
    return enviar({ texto }, { tipo: "texto", contenido: texto, enlace });
  }
  if (/\.(xlsx|xls|csv)$/.test(nombre)) {
    const texto = await leerExcel(archivo);
    return enviar({ texto }, { tipo: "texto", contenido: texto, enlace });
  }
  if (archivo.type.startsWith("image/")) {
    const imagen = await reducirImagen(await createImageBitmap(archivo));
    return enviar({ imagenes: [imagen] }, { tipo: "imagenes", contenido: [imagen], enlace });
  }
  if (/\.(txt|eml)$/.test(nombre) || archivo.type.startsWith("text/")) {
    const texto = await archivo.text();
    return enviar({ texto }, { tipo: "texto", contenido: texto, enlace });
  }
  throw new Error("Ese tipo de archivo no se puede leer. Use PDF, Excel, una foto o texto.");
}

let pdfjs = null;
async function cargarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(PDFJS);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return pdfjs;
}

// Extrae el texto del PDF respetando filas (útil para tablas). Si casi no hay texto, es un escaneo.
async function leerPDF(archivo) {
  const lib = await cargarPdfjs();
  const pdf = await lib.getDocument({ data: await archivo.arrayBuffer() }).promise;
  const paginas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const { items } = await pagina.getTextContent();
    const filas = new Map();
    for (const it of items) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      if (!filas.has(y)) filas.set(y, []);
      filas.get(y).push({ x: it.transform[4], fin: it.transform[4] + it.width, s: it.str });
    }
    const lineas = [...filas.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, partes]) => {
        partes.sort((a, b) => a.x - b.x);
        let linea = "", finAnterior = null;
        for (const pt of partes) {
          if (finAnterior !== null) linea += pt.x - finAnterior > 12 ? "  |  " : " ";
          linea += pt.s.trim();
          finAnterior = pt.fin;
        }
        return linea;
      });
    paginas.push(lineas.join("\n"));
  }
  const texto = paginas.join("\n\n--- página siguiente ---\n\n");
  if (texto.replace(/\s/g, "").length >= 40) return { texto };

  // Escaneo: se convierten las primeras páginas en imagen
  mensaje("El documento es escaneado; preparando la imagen…", "cargando");
  const imagenes = [];
  for (let p = 1; p <= Math.min(pdf.numPages, MAX_PAGINAS_IMAGEN); p++) {
    const pagina = await pdf.getPage(p);
    const base = pagina.getViewport({ scale: 1 });
    const escala = Math.min(2.5, 1700 / Math.max(base.width, base.height));
    const vista = pagina.getViewport({ scale: escala });
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(vista.width);
    lienzo.height = Math.round(vista.height);
    await pagina.render({ canvasContext: lienzo.getContext("2d"), viewport: vista }).promise;
    imagenes.push(await reducirImagen(lienzo));
  }
  return { imagenes };
}

async function leerExcel(archivo) {
  const XLSX = await import(SHEETJS);
  const libro = XLSX.read(await archivo.arrayBuffer());
  return libro.SheetNames.map((n) => `Hoja: ${n}\n${XLSX.utils.sheet_to_csv(libro.Sheets[n], { blankrows: false })}`).join("\n\n");
}

// Reduce la imagen a un tamaño razonable para no superar el límite de 2 MB
async function reducirImagen(fuente, maximo = 1700) {
  const w = fuente.width, h = fuente.height;
  const f = Math.min(1, maximo / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * f);
  c.height = Math.round(h * f);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(fuente, 0, 0, c.width, c.height);
  for (const calidad of [0.85, 0.7, 0.55]) {
    const url = c.toDataURL("image/jpeg", calidad);
    if (url.length < 600 * 1024) return url;
  }
  return c.toDataURL("image/jpeg", 0.45);
}

// ---------------- Envío al servidor ----------------

async function enviar(contenido, vista) {
  mensaje(contenido.imagenes ? "Leyendo la imagen del documento… (puede tardar unos segundos)" : "Ordenando los datos del documento…", "cargando");
  const cuerpo = JSON.stringify({ modo: estado.modo, ...contenido });
  if (new Blob([cuerpo]).size > MAX_BYTES) throw new Error("El documento es demasiado grande para la demo (máximo 2 MB).");

  const inicio = performance.now();
  let r;
  try {
    r = await fetch("/api/procesar", { method: "POST", headers: { "content-type": "application/json" }, body: cuerpo });
  } catch {
    throw new Error("No hay conexión con el servidor. Revise su internet e intente de nuevo.");
  }
  const j = await r.json().catch(() => ({ ok: false, error: "Respuesta inesperada del servidor." }));
  if (!j.ok) throw new Error(j.error || "No se pudo leer el documento.");

  const segundos = ((performance.now() - inicio) / 1000).toFixed(1);
  estado.datos = normalizarDatos(j.datos);
  estado.aprobado = false;
  mostrarOriginal(vista);
  pintarRevision();
  mensaje(`Listo: documento leído en ${segundos} segundos. Revise los datos abajo.`);
  $("#paso-2").classList.remove("oculto");
  $("#paso-3").classList.remove("oculto");
  $("#paso-2").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Todos los valores se manejan como texto en las casillas
function normalizarDatos(d) {
  const conf = CAMPOS[estado.modo];
  const claveLineas = estado.modo === "pedido" ? "lineas" : "items";
  const salida = {};
  for (const [k, v] of Object.entries(d)) if (k !== claveLineas) salida[k] = aTexto(v);
  salida.lineas = (d[claveLineas] || []).map((l) => {
    const fila = conf.nuevaLinea();
    for (const k of Object.keys(fila)) fila[k] = aTexto(l[k]);
    return fila;
  });
  return salida;
}

function paraValidar() {
  const d = estado.datos;
  return estado.modo === "pedido" ? d : { ...d, items: d.lineas };
}

function mostrarOriginal(vista) {
  const cuerpo = $("#original-cuerpo");
  cuerpo.innerHTML = "";
  if (vista.nota) {
    const p = document.createElement("p");
    p.className = "letra-chica";
    p.textContent = vista.nota;
    cuerpo.appendChild(p);
  }
  if (vista.tipo === "texto") {
    const pre = document.createElement("pre");
    pre.textContent = vista.contenido;
    cuerpo.appendChild(pre);
  } else {
    for (const src of vista.contenido) {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Documento original";
      cuerpo.appendChild(img);
    }
  }
  if (vista.enlace) {
    const a = document.createElement("a");
    a.href = vista.enlace;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Abrir el archivo original";
    cuerpo.appendChild(a);
  }
  $("#original").open = false;
}

// ---------------- Pantalla de revisión ----------------

function crearCampo(def, valor, alCambiar, extra = {}) {
  const etq = document.createElement("label");
  etq.className = `campo${def.ancho ? " ancho-completo" : ""}`;
  const span = document.createElement("span");
  span.textContent = def.e;
  etq.appendChild(span);
  if (def.calc) {
    const div = document.createElement("div");
    div.className = "calculado";
    div.dataset.calc = def.k;
    etq.appendChild(div);
    return etq;
  }
  const inp = document.createElement("input");
  inp.value = valor;
  inp.dataset.campo = def.k;
  if (extra.linea !== undefined) inp.dataset.linea = extra.linea;
  if (def.n) inp.inputMode = "decimal";
  if (def.ph) inp.placeholder = def.ph;
  inp.setAttribute("aria-label", def.e);
  inp.addEventListener("input", () => {
    alCambiar(inp.value);
    desaprobar();
    actualizarAlertas();
  });
  etq.appendChild(inp);
  return etq;
}

function pintarRevision() {
  const conf = CAMPOS[estado.modo];
  const d = estado.datos;
  const cont = $("#revision");
  cont.innerHTML = "";

  const t1 = document.createElement("h3");
  t1.className = "seccion-titulo";
  t1.textContent = estado.modo === "pedido" ? "Datos del pedido" : "Datos de la factura";
  cont.appendChild(t1);

  const cab = document.createElement("div");
  cab.className = `encabezado ${estado.modo}`;
  for (const def of conf.cabecera) cab.appendChild(crearCampo(def, d[def.k] ?? "", (v) => (d[def.k] = v)));
  cont.appendChild(cab);

  const t2 = document.createElement("h3");
  t2.className = "seccion-titulo";
  t2.textContent = estado.modo === "pedido" ? "Líneas del pedido" : "Ítems";
  cont.appendChild(t2);

  const tabla = document.createElement("div");
  tabla.className = "lineas";
  tabla.style.setProperty("--columnas", conf.columnas);

  const encab = document.createElement("div");
  encab.className = "cabecera-tabla";
  for (const def of conf.linea) {
    const s = document.createElement("span");
    s.textContent = def.e;
    encab.appendChild(s);
  }
  encab.appendChild(document.createElement("span"));
  tabla.appendChild(encab);

  d.lineas.forEach((l, i) => {
    const fila = document.createElement("div");
    fila.className = "linea";
    fila.dataset.indice = i;

    const top = document.createElement("div");
    top.className = "linea-cab";
    top.innerHTML = `<span>${estado.modo === "pedido" ? "Línea" : "Ítem"} ${i + 1}</span>`;
    const borrar = document.createElement("button");
    borrar.className = "boton peligro";
    borrar.textContent = "Quitar";
    borrar.addEventListener("click", () => quitarLinea(i));
    top.appendChild(borrar);
    fila.appendChild(top);

    for (const def of conf.linea) fila.appendChild(crearCampo(def, l[def.k] ?? "", (v) => (l[def.k] = v), { linea: i }));

    const borrar2 = document.createElement("button");
    borrar2.className = "boton peligro borrar-escritorio";
    borrar2.textContent = "✕";
    borrar2.title = "Quitar línea";
    borrar2.setAttribute("aria-label", `Quitar línea ${i + 1}`);
    borrar2.addEventListener("click", () => quitarLinea(i));
    fila.appendChild(borrar2);

    const alertas = document.createElement("ul");
    alertas.className = "linea-alertas";
    fila.appendChild(alertas);
    tabla.appendChild(fila);
  });
  cont.appendChild(tabla);

  const agregar = document.createElement("button");
  agregar.className = "boton secundario agregar";
  agregar.textContent = estado.modo === "pedido" ? "Agregar línea" : "Agregar ítem";
  agregar.addEventListener("click", () => {
    d.lineas.push(conf.nuevaLinea());
    desaprobar();
    pintarRevision();
  });
  cont.appendChild(agregar);

  const tot = document.createElement("div");
  tot.className = "totales";
  tot.id = "totales";
  cont.appendChild(tot);

  if (conf.totales) {
    const t3 = document.createElement("h3");
    t3.className = "seccion-titulo";
    t3.textContent = "Totales de la factura";
    cont.insertBefore(t3, tot);
    const grid = document.createElement("div");
    grid.className = "encabezado factura-totales";
    for (const def of conf.totales) grid.appendChild(crearCampo({ ...def, n: true }, d[def.k] ?? "", (v) => (d[def.k] = v)));
    cont.insertBefore(grid, tot);
  }

  actualizarAlertas();
}

function quitarLinea(i) {
  estado.datos.lineas.splice(i, 1);
  desaprobar();
  pintarRevision();
}

function problemasActuales() {
  return estado.modo === "pedido" ? validarPedido(paraValidar(), estado.catalogo) : validarFactura(paraValidar());
}

function actualizarAlertas() {
  const problemas = problemasActuales();

  // Colores en las casillas
  document.querySelectorAll("#revision input").forEach((inp) => {
    const linea = inp.dataset.linea === undefined ? null : Number(inp.dataset.linea);
    const p = problemas.filter((x) => x.campo === inp.dataset.campo && x.linea === linea);
    inp.classList.toggle("rojo", p.some((x) => x.nivel === "rojo"));
    inp.classList.toggle("amarillo", !p.some((x) => x.nivel === "rojo") && p.some((x) => x.nivel === "amarillo"));
  });

  // Mensajes bajo cada línea
  document.querySelectorAll("#revision .linea").forEach((fila) => {
    const i = Number(fila.dataset.indice);
    const l = estado.datos.lineas[i];
    const propios = problemas.filter((x) => x.linea === i);
    const ul = fila.querySelector(".linea-alertas");
    ul.innerHTML = "";
    for (const p of propios) {
      const li = document.createElement("li");
      li.className = p.nivel;
      const m = p.mensaje.replace(/^(Línea|Ítem) \d+: /, "");
      li.textContent = m.charAt(0).toUpperCase() + m.slice(1);
      ul.appendChild(li);
    }
    fila.classList.toggle("con-rojo", propios.some((x) => x.nivel === "rojo"));
    fila.querySelectorAll("[data-calc]").forEach((el) => {
      const def = CAMPOS[estado.modo].linea.find((c) => c.k === el.dataset.calc);
      el.textContent = def.calc(l);
    });
  });

  // Resumen arriba
  const resumen = $("#resumen-alertas");
  resumen.innerHTML = "";
  const rojos = problemas.filter((p) => p.nivel === "rojo").length;
  const amarillos = problemas.length - rojos;
  if (!problemas.length) {
    resumen.innerHTML = estado.modo === "pedido"
      ? `<p class="todo-bien">Todo cuadra con el catálogo y las reglas de la finca. Revise y apruebe.</p>`
      : `<p class="todo-bien">Todo cuadra: RUC, sumas de los ítems, IVA y total. Revise y apruebe.</p>`;
  } else {
    const t = document.createElement("p");
    t.className = "ayuda";
    t.innerHTML = `<strong>${problemas.length} ${problemas.length === 1 ? "punto" : "puntos"} por revisar:</strong> ${rojos} en rojo, ${amarillos} en amarillo.`;
    resumen.appendChild(t);
    const ul = document.createElement("ul");
    ul.className = "lista-alertas";
    for (const p of [...problemas].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "rojo" ? -1 : 1))) {
      const li = document.createElement("li");
      li.className = p.nivel;
      li.textContent = p.mensaje;
      ul.appendChild(li);
    }
    resumen.appendChild(ul);
  }

  pintarTotales();
}

function pintarTotales() {
  const tot = $("#totales");
  const d = estado.datos;
  const filas = [];
  if (estado.modo === "pedido") {
    let cajas = 0, tallos = 0, valor = 0, conPrecio = false;
    for (const l of d.lineas) {
      cajas += num(l.cajas) || 0;
      const t = totalTallosCalculado(l) ?? num(l.total_tallos_declarado) ?? 0;
      tallos += t;
      if (num(l.precio_tallo) !== null) { valor += t * num(l.precio_tallo); conPrecio = true; }
    }
    filas.push(["Cajas", fmtEntero(cajas)], ["Tallos", fmtEntero(tallos)]);
    if (conPrecio) filas.push(["Valor estimado", `$${valor.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]);
  } else {
    const suma = d.lineas.reduce((s, l) => s + (num(l.subtotal_linea) || 0), 0);
    const st = num(d.subtotal) || 0, iva = num(d.iva) || 0;
    filas.push(["Suma de los ítems", `$${suma.toFixed(2)}`], ["Subtotal + IVA", `$${(st + iva).toFixed(2)}`]);
  }
  tot.innerHTML = "";
  for (const [k, v] of filas) {
    const div = document.createElement("div");
    div.innerHTML = `<span></span><strong></strong>`;
    div.firstChild.textContent = k;
    div.lastChild.textContent = v;
    tot.appendChild(div);
  }
}

// ---------------- Aprobación y descarga ----------------

function desaprobar() {
  if (!estado.aprobado) return;
  estado.aprobado = false;
  $("#descargas").classList.add("oculto");
  $("#btn-aprobar").classList.remove("oculto");
}

function aprobar() {
  const rojos = problemasActuales().filter((p) => p.nivel === "rojo").length;
  if (rojos && !confirm(`Quedan ${rojos} ${rojos === 1 ? "punto" : "puntos"} en rojo. ¿Aprobar de todas formas?`)) return;
  estado.aprobado = true;
  const hora = new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
  $("#texto-aprobado").textContent = rojos
    ? `Aprobado a las ${hora}, con ${rojos} ${rojos === 1 ? "punto" : "puntos"} en rojo sin corregir.`
    : `Aprobado a las ${hora}. Listo para cargar.`;
  $("#btn-aprobar").classList.add("oculto");
  $("#descargas").classList.remove("oculto");
}

function filasExportacion() {
  const d = estado.datos;
  if (estado.modo === "pedido") {
    return d.lineas.map((l) => {
      const tallos = totalTallosCalculado(l) ?? num(l.total_tallos_declarado);
      const precio = num(l.precio_tallo);
      return {
        CLIENTE: d.cliente, PEDIDO: d.numero_pedido, FECHA_ENTREGA: d.fecha_entrega, MERCADO: d.mercado,
        VARIEDAD: l.variedad, LARGO_CM: num(l.largo_cm), CAJAS: num(l.cajas), TIPO_CAJA: l.tipo_caja,
        BONCHES_CAJA: num(l.bonches_por_caja), TALLOS_BONCHE: num(l.tallos_por_bonche), TOTAL_TALLOS: tallos,
        PRECIO_TALLO: precio, VALOR_LINEA: tallos !== null && precio !== null ? Math.round(tallos * precio * 100) / 100 : null,
      };
    });
  }
  return d.lineas.map((l) => ({
    PROVEEDOR: d.proveedor, RUC: d.ruc, NUMERO_FACTURA: d.numero_factura, FECHA: d.fecha,
    DESCRIPCION: l.descripcion, CANTIDAD: num(l.cantidad), PRECIO_UNITARIO: num(l.precio_unitario), VALOR_LINEA: num(l.subtotal_linea),
    SUBTOTAL: num(d.subtotal), TARIFA_IVA: num(d.tarifa_iva), IVA: num(d.iva), TOTAL: num(d.total),
  }));
}

async function descargar(tipo) {
  if (!estado.aprobado) return;
  const filas = filasExportacion();
  const base = `${estado.modo === "pedido" ? "pedido" : "factura"}_para_cargar_${new Date().toISOString().slice(0, 10)}`;
  if (tipo === "csv") {
    const cols = Object.keys(filas[0] || {});
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...filas.map((f) => cols.map((c) => esc(f[c])).join(","))].join("\r\n");
    bajar(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
    return;
  }
  const XLSX = await import(SHEETJS);
  const hoja = XLSX.utils.json_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, estado.modo === "pedido" ? "Pedido" : "Factura");
  XLSX.writeFile(libro, `${base}.xlsx`);
}

function bajar(blob, nombre) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

iniciar();
