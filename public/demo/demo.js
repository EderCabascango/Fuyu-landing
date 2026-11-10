import { validarPedido, validarFactura, totalTallosCalculado } from "./validaciones.js";

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PAGINAS_IMAGEN = 3;

// tipo: cómo se dibuja la miniatura. dificultad: qué tiene de difícil.
const EJEMPLOS = {
  pedido: [
    { archivo: "pedido_correo_ingles.txt", tipo: "correo", titulo: "Correo en inglés", dificultad: "En inglés, con cajas HB y QB" },
    { archivo: "pedido_whatsapp.txt", tipo: "chat", titulo: "WhatsApp de un cliente", dificultad: "Mensajes sueltos, abreviaturas y una corrección a la mitad" },
    { archivo: "pedido_tabla.pdf", tipo: "pdf", titulo: "Orden de compra en PDF", dificultad: "Tabla de un importador de Moscú, con totales por línea" },
    { archivo: "pedido_excel.xlsx", tipo: "excel", titulo: "Pedido en Excel", dificultad: "Datos del cliente arriba, tabla abajo y notas sueltas" },
    { archivo: "pedido_con_errores.txt", tipo: "correo", titulo: "Pedido con errores", dificultad: "Una variedad que no existe y una suma mal hecha", error: true },
  ],
  factura: [
    { archivo: "factura_cartonera.pdf", tipo: "pdf", titulo: "Factura de cartón", dificultad: "Factura limpia: todo debería cuadrar" },
    { archivo: "factura_insumos_total_mal.pdf", tipo: "pdf", titulo: "Factura de insumos", dificultad: "El total está mal calculado", error: true },
    { archivo: "factura_frio_escaneada.pdf", tipo: "escaneo", titulo: "Factura escaneada", dificultad: "Papel escaneado, un poco torcido y con firma" },
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

const estado = { modo: "pedido", datos: null, catalogo: null, aprobado: false, nombreDoc: "", preparado: null };
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

  // Subir archivo: tocar o arrastrar y soltar
  const soltar = $("#soltar");
  $("#archivo").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) usarArchivoPropio(f);
    e.target.value = "";
  });
  soltar.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#archivo").click(); }
  });
  ["dragenter", "dragover"].forEach((ev) => soltar.addEventListener(ev, (e) => { e.preventDefault(); soltar.classList.add("encima"); }));
  ["dragleave", "drop"].forEach((ev) => soltar.addEventListener(ev, (e) => { e.preventDefault(); soltar.classList.remove("encima"); }));
  soltar.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f) usarArchivoPropio(f);
  });
  $("#btn-ver-texto").addEventListener("click", usarTextoPegado);

  $("#btn-ir-subir").addEventListener("click", (e) => {
    e.preventDefault();
    $("#subir").scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => soltar.focus({ preventScroll: true }), 400);
  });
  $("#vp-cerrar").addEventListener("click", cerrarVistaPrevia);
  $("#btn-leer-doc").addEventListener("click", leerConFuyu);
  $("#btn-aprobar").addEventListener("click", aprobar);
  $("#btn-excel").addEventListener("click", () => descargar("xlsx"));
  $("#btn-csv").addEventListener("click", () => descargar("csv"));
  pintarEjemplos();
  ponerPaso(1);
}

function ponerPaso(n) {
  document.querySelectorAll("#pasos li").forEach((li) => {
    const p = Number(li.dataset.paso);
    li.classList.toggle("activo", p === n);
    li.classList.toggle("hecho", p < n);
    if (p === n) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
  });
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
  $("#soltar-formatos").textContent = modo === "factura" ? "PDF o foto de la factura · máximo 2 MB" : "PDF, Excel, foto o texto · máximo 2 MB";
  cerrarVistaPrevia();
  mensaje("");
  pintarEjemplos();
}

function miniatura(tipo) {
  const m = document.createElement("span");
  m.className = `mini mini-${tipo}`;
  m.setAttribute("aria-hidden", "true");
  const html = {
    correo: `<span class="m-cab"><i></i><i></i></span><i style="width:70%"></i><i style="width:85%"></i><i style="width:55%"></i><i style="width:75%"></i>`,
    chat: `<span class="m-cab"></span><b></b><b style="width:50%"></b><b class="d"></b><b style="width:70%"></b>`,
    pdf: `<span class="m-hoja"><i style="width:55%"></i><i style="width:35%"></i><span class="m-tabla"></span><i style="width:40%;margin-left:auto"></i></span>`,
    excel: `<span class="h"></span><span class="h"></span><span class="h"></span><span class="h"></span>${"<span></span>".repeat(16)}`,
    escaneo: `<span class="m-hoja"><i style="width:50%"></i><i style="width:70%"></i><i></i><i></i><i style="width:60%"></i><i style="width:35%;margin-left:auto"></i></span>`,
  };
  m.innerHTML = html[tipo] || html.correo;
  return m;
}

function pintarEjemplos() {
  const cont = $("#ejemplos");
  cont.innerHTML = "";
  for (const ej of EJEMPLOS[estado.modo]) {
    const b = document.createElement("button");
    b.className = "ejemplo";
    b.type = "button";
    b.dataset.archivo = ej.archivo;
    const texto = document.createElement("span");
    texto.className = "ejemplo-texto";
    const t = document.createElement("strong");
    t.textContent = ej.titulo;
    const d = document.createElement("span");
    d.textContent = ej.dificultad;
    if (ej.error) d.classList.add("marca-error");
    texto.append(t, d);
    b.append(miniatura(ej.tipo), texto);
    b.addEventListener("click", () => elegirEjemplo(ej));
    cont.appendChild(b);
  }
}

function bloquear(si) {
  document.querySelectorAll(".ejemplo, #btn-leer-doc, .modo, #btn-ver-texto").forEach((b) => (b.disabled = si));
}

function ocultarRevision() {
  $("#paso-2").classList.add("oculto");
  $("#paso-3").classList.add("oculto");
}

// ---------------- Elegir y ver el documento ----------------

async function elegirEjemplo(ej) {
  try {
    bloquear(true);
    mensaje("Abriendo el ejemplo…", "cargando");
    const r = await fetch(`ejemplos/${ej.archivo}`);
    if (!r.ok) throw new Error("No se pudo abrir el ejemplo.");
    const blob = await r.blob();
    const preparado = await prepararArchivo(new File([blob], ej.archivo, { type: blob.type }));
    document.querySelectorAll(".ejemplo").forEach((b) => b.classList.toggle("elegido", b.dataset.archivo === ej.archivo));
    mostrarVistaPrevia(ej.titulo, preparado);
    mensaje("");
  } catch (e) {
    mensaje(e.message, "error");
  } finally {
    bloquear(false);
  }
}

async function usarArchivoPropio(archivo) {
  try {
    bloquear(true);
    mensaje("Abriendo su documento…", "cargando");
    const preparado = await prepararArchivo(archivo);
    document.querySelectorAll(".ejemplo").forEach((b) => b.classList.remove("elegido"));
    mostrarVistaPrevia(archivo.name, preparado);
    mensaje("");
  } catch (e) {
    mensaje(e.message, "error");
  } finally {
    bloquear(false);
  }
}

function usarTextoPegado() {
  const texto = $("#texto").value.trim();
  if (!texto) return mensaje("Pegue primero el texto del correo o del WhatsApp.", "error");
  document.querySelectorAll(".ejemplo").forEach((b) => b.classList.remove("elegido"));
  mostrarVistaPrevia("Texto pegado", { contenido: { texto }, vista: vistaDeTexto(texto) });
}

function mostrarVistaPrevia(titulo, preparado) {
  estado.preparado = preparado;
  estado.nombreDoc = titulo;
  ocultarRevision();
  ponerPaso(1);
  $("#vp-titulo").textContent = titulo;
  $("#btn-leer-doc").textContent = estado.modo === "pedido" ? "Leer este pedido con Fuyu" : "Leer esta factura con Fuyu";
  pintarDocumento(preparado.vista, $("#vp-documento"));
  const vp = $("#vista-previa");
  vp.classList.remove("oculto");
  vp.scrollIntoView({ behavior: "smooth", block: "start" });
  vp.focus({ preventScroll: true });
}

function cerrarVistaPrevia() {
  estado.preparado = null;
  $("#vista-previa").classList.add("oculto");
  $("#vp-documento").innerHTML = "";
  document.querySelectorAll(".ejemplo").forEach((b) => b.classList.remove("elegido"));
  ocultarRevision();
  ponerPaso(1);
}

async function leerConFuyu() {
  if (!estado.preparado) return;
  try {
    bloquear(true);
    ponerPaso(2);
    await enviar(estado.preparado.contenido, estado.preparado.vista);
    ponerPaso(3);
  } catch (e) {
    ponerPaso(1);
    mensaje(e.message, "error");
    $("#estado").scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    bloquear(false);
  }
}

// ---------------- Preparar el archivo en el navegador ----------------

// Devuelve { contenido: lo que se envía, vista: cómo se muestra en pantalla }
async function prepararArchivo(archivo) {
  if (archivo.size > MAX_BYTES) throw new Error("El archivo pesa más de 2 MB. Pruebe con uno más liviano.");
  const nombre = archivo.name.toLowerCase();

  if (nombre.endsWith(".pdf")) {
    const lib = await cargarPdfjs();
    const pdf = await lib.getDocument({ data: await archivo.arrayBuffer() }).promise;
    const paginas = await dibujarPaginas(pdf);
    const texto = await textoDelPDF(pdf);
    if (texto.replace(/\s/g, "").length >= 40) return { contenido: { texto }, vista: { tipo: "pdf", paginas } };
    const imagenes = await imagenesDelPDF(pdf);
    return { contenido: { imagenes }, vista: { tipo: "pdf", paginas, escaneo: true } };
  }
  if (/\.(xlsx|xls|csv)$/.test(nombre)) {
    const XLSX = await import(SHEETJS);
    const libro = XLSX.read(await archivo.arrayBuffer());
    const texto = libro.SheetNames.map((n) => `Hoja: ${n}\n${XLSX.utils.sheet_to_csv(libro.Sheets[n], { blankrows: false })}`).join("\n\n");
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: "", raw: false });
    return { contenido: { texto }, vista: { tipo: "excel", filas, hoja: libro.SheetNames[0] } };
  }
  if (archivo.type.startsWith("image/")) {
    const imagen = await reducirImagen(await createImageBitmap(archivo));
    return { contenido: { imagenes: [imagen] }, vista: { tipo: "imagen", urls: [imagen] } };
  }
  if (/\.(txt|eml)$/.test(nombre) || archivo.type.startsWith("text/")) {
    const texto = await archivo.text();
    return { contenido: { texto }, vista: vistaDeTexto(texto) };
  }
  throw new Error("Ese tipo de archivo no se puede leer. Use PDF, Excel, una foto o texto.");
}

// Reconoce un chat de WhatsApp exportado o un correo; si no, lo muestra como texto
function vistaDeTexto(texto) {
  const lineas = texto.replace(/\r/g, "").split("\n");
  const reChat = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2})(?::\d{2})?\]\s*([^:]+):\s*(.*)$/;
  const mensajes = [];
  for (const l of lineas) {
    const m = l.match(reChat);
    if (m) mensajes.push({ fecha: m[1], hora: m[2], autor: m[3].trim(), texto: m[4] });
    else if (mensajes.length && l.trim()) mensajes[mensajes.length - 1].texto += `\n${l}`;
  }
  if (mensajes.length >= 2) return { tipo: "chat", mensajes };

  const cab = {};
  let i = 0;
  const reCab = /^(From|To|Date|Subject|De|Para|Fecha|Asunto|Cc)\s*:\s*(.*)$/i;
  while (i < lineas.length && reCab.test(lineas[i])) {
    const [, k, v] = lineas[i].match(reCab);
    cab[k.toLowerCase()] = v;
    i++;
  }
  if (Object.keys(cab).length >= 2) {
    return {
      tipo: "correo",
      de: cab.from || cab.de || "",
      para: cab.to || cab.para || "",
      fecha: cab.date || cab.fecha || "",
      asunto: cab.subject || cab.asunto || "(sin asunto)",
      cuerpo: lineas.slice(i).join("\n").trim(),
    };
  }
  return { tipo: "texto", texto };
}

let pdfjs = null;
async function cargarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(PDFJS);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return pdfjs;
}

// Dibuja las páginas (máximo 3) para verlas en pantalla
async function dibujarPaginas(pdf) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const paginas = [];
  for (let p = 1; p <= Math.min(pdf.numPages, MAX_PAGINAS_IMAGEN); p++) {
    const pagina = await pdf.getPage(p);
    const base = pagina.getViewport({ scale: 1 });
    const vista = pagina.getViewport({ scale: (760 * dpr) / base.width });
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(vista.width);
    lienzo.height = Math.round(vista.height);
    await pagina.render({ canvasContext: lienzo.getContext("2d"), viewport: vista }).promise;
    paginas.push(lienzo);
  }
  return paginas;
}

// Extrae el texto del PDF respetando filas (útil para tablas)
async function textoDelPDF(pdf) {
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
  return paginas.join("\n\n--- página siguiente ---\n\n");
}

// Documento escaneado: las primeras páginas se envían como imagen
async function imagenesDelPDF(pdf) {
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
  return imagenes;
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

// ---------------- Dibujar el documento como se ve en la vida real ----------------

function nodo(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function pintarDocumento(vista, cont) {
  cont.innerHTML = "";
  if (vista.tipo === "chat") {
    const autores = [...new Set(vista.mensajes.map((m) => m.autor))];
    const esFinca = (a) => /rosas del valle|finca/i.test(a);
    const contacto = autores.find((a) => !esFinca(a)) || autores[0];
    const chat = nodo("div", "doc-chat");
    const cab = nodo("div", "doc-chat-cab");
    cab.append(nodo("span", "doc-chat-avatar", contacto.trim().charAt(0).toUpperCase()), nodo("span", "", contacto));
    const cuerpo = nodo("div", "doc-chat-cuerpo");
    if (vista.mensajes[0]?.fecha) cuerpo.append(nodo("span", "doc-chat-dia", vista.mensajes[0].fecha));
    for (const m of vista.mensajes) {
      const b = nodo("p", `burbuja ${esFinca(m.autor) ? "finca" : "cliente"}`);
      b.append(document.createTextNode(m.texto), nodo("span", "hora", m.hora));
      cuerpo.append(b);
    }
    chat.append(cab, cuerpo);
    cont.append(chat);
    return;
  }
  if (vista.tipo === "correo") {
    const c = nodo("article", "doc-correo");
    const cab = nodo("div", "doc-correo-cab");
    cab.append(nodo("h4", "doc-correo-asunto", vista.asunto));
    const dl = nodo("dl", "doc-correo-meta");
    for (const [k, v] of [["De", vista.de], ["Para", vista.para], ["Fecha", vista.fecha]]) {
      if (!v) continue;
      dl.append(nodo("dt", "", k), nodo("dd", "", v));
    }
    cab.append(dl);
    c.append(cab, nodo("div", "doc-correo-cuerpo", vista.cuerpo));
    cont.append(c);
    return;
  }
  if (vista.tipo === "pdf") {
    const caja = nodo("div", "doc-pdf");
    for (const original of vista.paginas) {
      const copia = document.createElement("canvas");
      copia.width = original.width;
      copia.height = original.height;
      copia.getContext("2d").drawImage(original, 0, 0);
      copia.setAttribute("role", "img");
      copia.setAttribute("aria-label", "Página del documento");
      caja.append(copia);
    }
    cont.append(caja);
    return;
  }
  if (vista.tipo === "excel") {
    const caja = nodo("div", "doc-excel");
    const t = nodo("table");
    const filas = vista.filas.slice(0, 15);
    const ncol = Math.max(...filas.map((f) => f.length), 1);
    const thead = nodo("thead");
    const trh = nodo("tr");
    trh.append(nodo("th", "", ""));
    for (let c = 0; c < ncol; c++) trh.append(nodo("th", "", String.fromCharCode(65 + c)));
    thead.append(trh);
    const tbody = nodo("tbody");
    filas.forEach((f, i) => {
      const tr = nodo("tr");
      tr.append(nodo("th", "", String(i + 1)));
      for (let c = 0; c < ncol; c++) tr.append(nodo("td", "", f[c] ?? ""));
      tbody.append(tr);
    });
    t.append(thead, tbody);
    caja.append(t, nodo("p", "doc-excel-pie", `Hoja “${vista.hoja}”${vista.filas.length > 15 ? " · primeras 15 filas" : ""}`));
    cont.append(caja);
    return;
  }
  if (vista.tipo === "imagen") {
    const caja = nodo("div", "doc-pdf");
    for (const src of vista.urls) {
      const img = nodo("img");
      img.src = src;
      img.alt = "Foto del documento";
      caja.append(img);
    }
    cont.append(caja);
    return;
  }
  cont.append(nodo("div", "doc-texto", vista.texto));
}

// ---------------- Envío al servidor ----------------

async function enviar(contenido, vista) {
  mensaje(contenido.imagenes ? "Fuyu está leyendo la imagen del documento… (puede tardar unos segundos)" : "Fuyu está leyendo el documento…", "cargando");
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

  const segundos = ((performance.now() - inicio) / 1000).toLocaleString("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  estado.datos = normalizarDatos(j.datos);
  estado.aprobado = false;
  mostrarOriginal(vista);
  pintarRevision();
  mensaje("");
  $("#tiempo-lectura").textContent = `Fuyu leyó ${estado.modo === "pedido" ? "este pedido" : "esta factura"} en ${segundos} s`;
  $("#paso-2").classList.remove("oculto");
  $("#paso-3").classList.remove("oculto");
  $("#descargas").classList.add("oculto");
  $("#btn-aprobar").classList.remove("oculto");
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
  pintarDocumento(vista, $("#original-cuerpo"));
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
