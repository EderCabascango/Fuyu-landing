import { validarPedido, validarFactura, totalTallosCalculado, buscarVariedad, dinero, miles } from "./validaciones.js";
import { revisarTipo } from "../componentes/tipo-documento.js";

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
      { k: "variedad", e: "Variedad", tam: 15 },
      { k: "largo_cm", e: "Largo", n: true, tam: 3 },
      { k: "cajas", e: "Cajas", n: true, tam: 3 },
      { k: "tipo_caja", e: "Tipo", tam: 3 },
      { k: "bonches_por_caja", e: "Bonches por caja", n: true, tam: 3 },
      { k: "tallos_por_bonche", e: "Tallos por bonche", n: true, tam: 3 },
      { k: "_calculado", e: "Tallos", calc: true },
      { k: "precio_tallo", e: "Precio", n: true, tam: 5 },
    ],
    nuevaLinea: () => ({ variedad: "", largo_cm: "", cajas: "", tipo_caja: "", bonches_por_caja: "", tallos_por_bonche: "25", total_tallos_declarado: "", precio_tallo: "", notas: "", fuente: "" }),
  },
  factura: {
    cabecera: [
      { k: "proveedor", e: "Proveedor" },
      { k: "ruc", e: "RUC" },
      { k: "numero_factura", e: "N.º de factura" },
      { k: "fecha", e: "Fecha", ph: "AAAA-MM-DD" },
    ],
    linea: [
      { k: "descripcion", e: "Descripción", tam: 26 },
      { k: "cantidad", e: "Cantidad", n: true, tam: 5 },
      { k: "precio_unitario", e: "Precio unitario", n: true, tam: 6 },
      { k: "subtotal_linea", e: "Valor", n: true, tam: 7 },
    ],
    totales: [
      { k: "subtotal", e: "Subtotal" },
      { k: "tarifa_iva", e: "IVA (%)" },
      { k: "iva", e: "IVA ($)" },
      { k: "total", e: "Total" },
    ],
    nuevaLinea: () => ({ descripcion: "", cantidad: "", precio_unitario: "", subtotal_linea: "", fuente: "" }),
  },
};

// ---------------- Estado ----------------

const estado = { modo: "pedido", datos: null, catalogo: null, aprobado: false, nombreDoc: "", preparado: null, ignorados: new Set(), fila: null, recorrido: false };
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
  document.querySelectorAll(".pestana").forEach((b) => b.addEventListener("click", () => cambiarPestana(b.dataset.pestana)));
  $("#pista-ok").addEventListener("click", ocultarPista);
  $("#btn-aprobar").addEventListener("click", aprobar);
  $("#btn-aprobar-igual").addEventListener("click", confirmarAprobacion);
  $("#btn-seguir").addEventListener("click", () => { ponerBarra("revisar"); $("#alertas").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("#btn-recorrido").addEventListener("click", recorrido);
  $("#recorrido-detener").addEventListener("click", () => { estado.recorrido = false; });
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

function cambiarModo(modo, { conservarDocumento = false } = {}) {
  if (modo === estado.modo) return;
  estado.modo = modo;
  document.querySelectorAll(".modo").forEach((b) => {
    const activo = b.dataset.modo === modo;
    b.classList.toggle("activo", activo);
    b.setAttribute("aria-selected", activo);
  });
  $("#bloque-texto").classList.toggle("oculto", modo === "factura");
  $("#soltar-formatos").textContent = modo === "factura" ? "PDF o foto de la factura · máximo 2 MB" : "PDF, Excel, foto o texto · máximo 2 MB";
  if (conservarDocumento && estado.preparado) {
    ocultarRevision();
    pintarEjemplos();
    mostrarVistaPrevia(estado.nombreDoc, estado.preparado);
    return;
  }
  cerrarVistaPrevia();
  mensaje("");
  pintarEjemplos();
}

// ---------------- Revisión del tipo de documento (sin gastar tokens) ----------------

const NOMBRE_MODO = { pedido: "Pedido de un cliente", factura: "Factura de proveedor" };

function mostrarAvisoPrevia(texto, sugerido) {
  const caja = $("#vp-aviso");
  if (!texto) {
    caja.classList.add("oculto");
    $("#btn-leer-doc").disabled = false;
    return;
  }
  $("#vp-aviso-texto").textContent = texto;
  const cambiar = $("#vp-cambiar");
  cambiar.classList.toggle("oculto", !sugerido);
  if (sugerido) {
    cambiar.textContent = `Cambiar a “${NOMBRE_MODO[sugerido]}”`;
    cambiar.onclick = () => cambiarModo(sugerido, { conservarDocumento: true });
  }
  caja.classList.remove("oculto");
  $("#btn-leer-doc").disabled = true;
}

function revisarDocumentoElegido() {
  const texto = estado.preparado?.contenido?.texto;
  // Las fotos y los escaneos no tienen texto aquí: los revisa el servidor
  if (!texto) return mostrarAvisoPrevia(null);
  const problema = revisarTipo(estado.modo, texto);
  mostrarAvisoPrevia(problema?.mensaje || null, problema?.sugerido || null);
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
  if (!si && !$("#vp-aviso").classList.contains("oculto")) $("#btn-leer-doc").disabled = true;
}

function ocultarRevision() {
  $("#paso-2").classList.add("oculto");
  $("#paso-3").classList.add("oculto");
  mostrarBarra(false);
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
  revisarDocumentoElegido();
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

// ---------------- Preparar el archivo en el navegador ----------------

// Devuelve { contenido: lo que se envía, vista: cómo se muestra en pantalla }
async function prepararArchivo(archivo) {
  if (archivo.size > MAX_BYTES) throw new Error("El archivo pesa más de 2 MB. Pruebe con uno más liviano.");
  const nombre = archivo.name.toLowerCase();

  if (nombre.endsWith(".pdf")) {
    const lib = await cargarPdfjs();
    const pdf = await lib.getDocument({ data: await archivo.arrayBuffer(), isEvalSupported: false }).promise;
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

// ---------------- Leer con Fuyu: etapas reales y tiempo ----------------

function etapa(n, estadoEtapa) {
  const li = document.querySelector(`#etapas li[data-etapa="${n}"]`);
  li.classList.remove("activa", "hecha", "fallo");
  if (estadoEtapa) li.classList.add(estadoEtapa);
}

async function leerConFuyu() {
  if (!estado.preparado) return;
  const { contenido, vista } = estado.preparado;
  const esPedido = estado.modo === "pedido";
  bloquear(true);
  ocultarRevision();
  mensaje("");
  ponerPaso(2);

  $("#leyendo-titulo").textContent = esPedido ? "Fuyu está leyendo su pedido" : "Fuyu está leyendo su factura";
  $("#etapa-2").textContent = esPedido ? "Buscando cliente, fecha y variedades" : "Buscando proveedor, RUC y valores";
  $("#etapa-3").textContent = esPedido ? "Revisando contra el catálogo de la finca" : "Revisando sumas, IVA y RUC";
  [1, 2, 3, 4].forEach((n) => etapa(n, null));
  const seccion = $("#leyendo");
  seccion.classList.remove("oculto");
  seccion.scrollIntoView({ behavior: "smooth", block: "start" });

  const inicio = performance.now();
  const segundos = () => ((performance.now() - inicio) / 1000).toLocaleString("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const reloj = setInterval(() => ($("#reloj").textContent = segundos()), 100);
  let enCurso = 1;

  try {
    // 1. El documento ya se leyó en el navegador; se prepara y se envía
    etapa(1, "activa");
    const cuerpo = JSON.stringify({ modo: estado.modo, ...contenido });
    if (new Blob([cuerpo]).size > MAX_BYTES) throw new Error("El documento es demasiado grande para la demo (máximo 2 MB).");
    const peticion = fetch("/api/procesar", { method: "POST", headers: { "content-type": "application/json" }, body: cuerpo });
    etapa(1, "hecha");

    // 2. Fuyu busca los datos (espera la respuesta del servidor)
    enCurso = 2;
    etapa(2, "activa");
    let r;
    try { r = await peticion; } catch { throw new Error("No hay conexión con el servidor. Revise su internet e intente de nuevo."); }
    const j = await r.json().catch(() => ({ ok: false, error: "Respuesta inesperada del servidor." }));
    if (!j.ok) {
      const falla = new Error(j.error || "No se pudo leer el documento.");
      falla.sugerido = j.sugerido || null;
      falla.tipo = r.status === 422;
      throw falla;
    }
    etapa(2, "hecha");

    // 3. Reglas fijas contra el catálogo
    enCurso = 3;
    etapa(3, "activa");
    estado.datos = normalizarDatos(j.datos);
    estado.ignorados = new Set();
    estado.fila = null;
    estado.aprobado = false;
    problemasActuales();
    await new Promise((ok) => setTimeout(ok, 350)); // para que la etapa se alcance a ver
    etapa(3, "hecha");

    etapa(4, "hecha");
    clearInterval(reloj);
    const total = segundos();
    $("#reloj").textContent = total;
    await new Promise((ok) => setTimeout(ok, 500));

    mostrarRevision(vista, contenido, total);
    seccion.classList.add("oculto");
    ponerPaso(3);
    $("#paso-2").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    clearInterval(reloj);
    etapa(enCurso, "fallo");
    seccion.classList.add("oculto");
    ponerPaso(1);
    if (e.tipo) {
      // El documento no es del tipo elegido: se avisa junto al documento
      mensaje("");
      mostrarAvisoPrevia(e.message, e.sugerido);
      $("#vista-previa").scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      mensaje(e.message, "error");
      $("#estado").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } finally {
    bloquear(false);
  }
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
    // Si la variedad es del catálogo (aunque venga en minúsculas o sin tildes), se escribe como en el catálogo
    if ("variedad" in fila && fila.variedad) {
      const { exacta } = buscarVariedad(fila.variedad, estado.catalogo);
      if (exacta) fila.variedad = exacta.nombre;
    }
    return fila;
  });
  return salida;
}

function paraValidar() {
  const d = estado.datos;
  return estado.modo === "pedido" ? d : { ...d, items: d.lineas };
}

// Problemas que siguen pendientes (los que el usuario dejó así no cuentan)
function problemasActuales() {
  const todos = estado.modo === "pedido" ? validarPedido(paraValidar(), estado.catalogo) : validarFactura(paraValidar());
  return todos.filter((p) => !estado.ignorados.has(p.clave));
}

// ---------------- Pantalla de revisión ----------------

function mostrarRevision(vista, contenido, segundos) {
  const esPedido = estado.modo === "pedido";
  $("#tiempo-lectura").textContent = `Fuyu leyó ${esPedido ? "este pedido" : "esta factura"} en ${segundos} s`;
  pintarDocumento(vista, $("#rev-documento"));
  const texto = contenido.texto || "";
  $("#texto-leido").classList.toggle("oculto", !texto);
  $("#texto-leido").open = false;
  $("#texto-leido-cuerpo").textContent = texto;
  cambiarPestana("tabla");
  pintarRevision();
  $("#paso-2").classList.remove("oculto");
  $("#paso-3").classList.add("oculto");
  mostrarBarra(true);
  ponerBarra("revisar");
}

function pistaYaVista() {
  try { return localStorage.getItem("fuyu-pista") === "1"; } catch { return false; }
}

function ocultarPista() {
  $("#pista").classList.add("oculto");
  try { localStorage.setItem("fuyu-pista", "1"); } catch {}
}

function cambiarPestana(cual) {
  $("#revision-grid").dataset.pestana = cual;
  document.querySelectorAll(".pestana").forEach((b) => {
    const activa = b.dataset.pestana === cual;
    b.classList.toggle("activa", activa);
    b.setAttribute("aria-selected", activa);
  });
}

const enCelular = () => window.matchMedia("(max-width: 899px)").matches;

function crearInput(def, valor, linea) {
  const inp = document.createElement("input");
  inp.value = valor;
  inp.dataset.campo = def.k;
  if (linea !== null) inp.dataset.linea = linea;
  if (def.n) inp.inputMode = "decimal";
  if (def.ph) inp.placeholder = def.ph;
  if (def.tam) inp.size = def.tam;
  inp.setAttribute("aria-label", linea !== null ? `${def.e}, línea ${linea + 1}` : def.e);
  inp.addEventListener("input", () => {
    if (linea !== null) estado.datos.lineas[linea][def.k] = inp.value;
    else estado.datos[def.k] = inp.value;
    ocultarPista();
    desaprobar();
    actualizarAlertas();
  });
  return inp;
}

function pintarRevision() {
  const conf = CAMPOS[estado.modo];
  const d = estado.datos;
  const cont = $("#revision");
  cont.innerHTML = "";

  // Datos generales
  const cab = document.createElement("div");
  cab.className = `encabezado ${estado.modo}`;
  for (const def of conf.cabecera) {
    const etq = document.createElement("label");
    etq.className = "campo";
    etq.append(nodo("span", "", def.e), crearInput(def, d[def.k] ?? "", null));
    cab.append(etq);
  }
  cont.append(cab);

  // Tabla editable
  const envoltura = nodo("div", "tabla-envoltura");
  const tabla = nodo("table", "tabla-rev");
  const thead = nodo("thead");
  const trh = nodo("tr");
  for (const def of conf.linea) trh.append(nodo("th", def.n || def.calc ? "num" : "", def.e));
  trh.append(nodo("th", "", ""));
  thead.append(trh);
  const tbody = nodo("tbody");
  d.lineas.forEach((l, i) => {
    const tr = nodo("tr", "fila");
    tr.dataset.linea = i;
    for (const def of conf.linea) {
      const td = nodo("td", def.n || def.calc ? "num" : "");
      td.dataset.etiqueta = def.e;
      if (def.calc) {
        td.append(nodo("span", "calculado"));
        td.dataset.calc = def.k;
      } else td.append(crearInput(def, l[def.k] ?? "", i));
      tr.append(td);
    }
    const tdq = nodo("td", "quitar");
    const q = nodo("button", "boton-quitar", "✕");
    q.type = "button";
    q.setAttribute("aria-label", `Quitar línea ${i + 1}`);
    q.addEventListener("click", (e) => { e.stopPropagation(); quitarLinea(i); });
    tdq.append(q);
    tr.append(tdq);
    tr.addEventListener("click", () => elegirFila(i));
    tr.addEventListener("focusin", () => elegirFila(i, { sinCambiarPestana: true }));
    tbody.append(tr);

    // Fila con la cita del documento (para PDF, fotos o cuando se pide verla)
    const trc = nodo("tr", "fila-cita oculto");
    trc.dataset.cita = i;
    const tdc = nodo("td");
    tdc.colSpan = conf.linea.length + 1;
    trc.append(tdc);
    tbody.append(trc);
  });
  tabla.append(thead, tbody);
  envoltura.append(tabla);
  cont.append(envoltura);

  const agregar = nodo("button", "boton secundario agregar", estado.modo === "pedido" ? "Agregar línea" : "Agregar ítem");
  agregar.type = "button";
  agregar.addEventListener("click", () => {
    d.lineas.push(conf.nuevaLinea());
    desaprobar();
    pintarRevision();
  });
  cont.append(agregar);

  if (conf.totales) {
    const grid = nodo("div", "encabezado factura-totales");
    for (const def of conf.totales) {
      const etq = nodo("label", "campo");
      etq.append(nodo("span", "", def.e), crearInput({ ...def, n: true }, d[def.k] ?? "", null));
      grid.append(etq);
    }
    cont.append(grid);
  }
  actualizarAlertas();
}

function quitarLinea(i) {
  estado.datos.lineas.splice(i, 1);
  estado.ignorados = new Set([...estado.ignorados].filter((k) => !/^\d+-/.test(k)));
  estado.fila = null;
  desaprobar();
  pintarRevision();
}

// ---------------- Resumen en una frase (calculado aquí) ----------------

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function fechaLarga(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]}` : null;
}

function fraseResumen(pendientes) {
  const d = estado.datos;
  const k = pendientes.length;
  const cola = k ? `${k} ${k === 1 ? "cosa" : "cosas"} para revisar.` : "Todo cuadra.";
  if (estado.modo === "pedido") {
    const variedades = new Set(d.lineas.map((l) => String(l.variedad).trim().toLowerCase()).filter(Boolean)).size;
    let tallos = 0, valor = 0, sinPrecio = 0;
    for (const l of d.lineas) {
      const t = totalTallosCalculado(l) ?? num(l.total_tallos_declarado) ?? 0;
      tallos += t;
      if (num(l.precio_tallo) !== null) valor += t * num(l.precio_tallo);
      else sinPrecio++;
    }
    const fecha = fechaLarga(d.fecha_entrega);
    const partes = [`${variedades} ${variedades === 1 ? "variedad" : "variedades"}`];
    if (tallos > 0) partes.push(`${miles(tallos)} tallos`);
    if (valor > 0) partes.push(`${dinero(valor)}${sinPrecio ? ` (sin contar ${sinPrecio === 1 ? "1 línea sin precio" : `${sinPrecio} líneas sin precio`})` : ""}`);
    return `Pedido ${d.cliente ? `de ${d.cliente}` : "sin cliente"}${fecha ? ` para el ${fecha}` : ""}: ${partes.join(", ")}. ${cola}`;
  }
  const fecha = fechaLarga(d.fecha);
  const total = num(d.total);
  const n = d.lineas.length;
  return `Factura ${d.proveedor ? `de ${d.proveedor}` : "sin proveedor"}${fecha ? ` del ${fecha}` : ""}: ${n} ${n === 1 ? "ítem" : "ítems"}${total !== null ? `, total ${dinero(total)}` : ""}. ${cola}`;
}

// ---------------- Avisos con arreglo en un toque ----------------

function actualizarAlertas() {
  const pendientes = problemasActuales();

  // Colores en las casillas
  document.querySelectorAll("#revision input").forEach((inp) => {
    const linea = inp.dataset.linea === undefined ? null : Number(inp.dataset.linea);
    const p = pendientes.filter((x) => x.campo === inp.dataset.campo && x.linea === linea);
    inp.classList.toggle("rojo", p.some((x) => x.nivel === "rojo"));
    inp.classList.toggle("amarillo", !p.some((x) => x.nivel === "rojo") && p.some((x) => x.nivel === "amarillo"));
  });

  // Tallos calculados y filas con problemas
  document.querySelectorAll("#revision .fila").forEach((tr) => {
    const i = Number(tr.dataset.linea);
    const l = estado.datos.lineas[i];
    const propios = pendientes.filter((x) => x.linea === i);
    tr.classList.toggle("con-rojo", propios.some((x) => x.nivel === "rojo"));
    tr.classList.toggle("con-amarillo", !propios.some((x) => x.nivel === "rojo") && propios.some((x) => x.nivel === "amarillo"));
    tr.querySelectorAll("[data-calc]").forEach((td) => {
      const span = td.querySelector(".calculado");
      span.textContent = fmtEntero(totalTallosCalculado(l));
      const suma = propios.find((x) => x.campo === "total_tallos_declarado");
      td.classList.toggle("celda-rojo", !!suma);
      td.querySelector("small")?.remove();
      if (suma) td.append(nodo("small", "", `el pedido dice ${fmtEntero(num(l.total_tallos_declarado))}`));
    });
  });

  // Tarjetas de aviso
  const cont = $("#alertas");
  cont.innerHTML = "";
  const orden = [...pendientes].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "rojo" ? -1 : 1));
  for (const p of orden) cont.append(tarjetaAviso(p));
  $("#resumen-frase").textContent = fraseResumen(pendientes);
  if (!estado.aprobado && $("#barra-aprobar").dataset.modo === "revisar") $("#ba-estado").textContent = textoPendientes();
  // La pista sale la primera vez y solo si hay algo marcado para corregir
  $("#pista").classList.toggle("oculto", pistaYaVista() || pendientes.length === 0);
  $("#resumen-frase").classList.toggle("con-pendientes", pendientes.length > 0);
}

function tarjetaAviso(p) {
  const card = nodo("div", `aviso-tarjeta ${p.nivel}`);
  card.tabIndex = 0;
  card.append(nodo("p", "aviso-texto", p.mensaje));
  const acciones = nodo("div", "aviso-acciones");
  for (const a of p.arreglos) {
    if (a.tipo === "elegir") {
      const sel = nodo("select", "aviso-elegir");
      sel.setAttribute("aria-label", a.texto);
      sel.append(new Option(a.texto, ""));
      a.opciones.forEach((o) => sel.append(new Option(o, o)));
      sel.addEventListener("click", (e) => e.stopPropagation());
      sel.addEventListener("change", () => sel.value && aplicar({ tipo: "poner", campo: a.campo, linea: a.linea, valor: sel.value }, p));
      acciones.append(sel);
      continue;
    }
    const b = nodo("button", a.tipo === "poner" ? "aviso-boton principal" : "aviso-boton", a.texto);
    b.type = "button";
    b.addEventListener("click", (e) => { e.stopPropagation(); aplicar(a, p); });
    acciones.append(b);
  }
  card.append(acciones);
  const seleccionar = () => {
    if (p.linea !== null) elegirFila(p.linea, { sinCambiarPestana: true });
    else marcarTextoEnDocumento(estado.datos[p.campo]);
  };
  card.addEventListener("click", seleccionar);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter") seleccionar(); });
  return card;
}

function inputDe(campo, linea) {
  const sel = linea === null ? `#revision input[data-campo="${campo}"]:not([data-linea])` : `#revision input[data-campo="${campo}"][data-linea="${linea}"]`;
  return document.querySelector(sel);
}

function aplicar(a, p) {
  if (a.tipo === "ignorar") {
    estado.ignorados.add(p.clave);
    desaprobar();
    actualizarAlertas();
    return;
  }
  if (a.tipo === "ver") {
    if (p.linea !== null) elegirFila(p.linea, { verDocumento: true });
    else { if (enCelular()) cambiarPestana("documento"); marcarTextoEnDocumento(estado.datos[p.campo]); }
    return;
  }
  if (a.tipo === "escribir") {
    cambiarPestana("tabla");
    const inp = inputDe(a.campo, a.linea);
    if (inp) { inp.scrollIntoView({ behavior: "smooth", block: "center" }); inp.focus({ preventScroll: true }); }
    return;
  }
  if (a.tipo === "poner") {
    if (a.linea !== null) estado.datos.lineas[a.linea][a.campo] = a.valor;
    else estado.datos[a.campo] = a.valor;
    const inp = inputDe(a.campo, a.linea);
    if (inp) inp.value = a.valor;
    ocultarPista();
    desaprobar();
    actualizarAlertas();
    if (a.linea !== null) elegirFila(a.linea, { sinCambiarPestana: true });
  }
}

// ---------------- Rastreo: de la fila al documento ----------------

function elegirFila(i, { verDocumento = false, sinCambiarPestana = false } = {}) {
  estado.fila = i;
  document.querySelectorAll("#revision .fila").forEach((tr) => tr.classList.toggle("elegida", Number(tr.dataset.linea) === i));
  document.querySelectorAll("#revision .fila-cita").forEach((tr) => tr.classList.add("oculto"));
  const fuente = estado.datos.lineas[i]?.fuente || "";
  const vista = estado.preparado?.vista;
  const enImagen = vista && (vista.tipo === "pdf" || vista.tipo === "imagen");
  // En celular, si se pidió ver el documento, primero se cambia de pestaña para poder marcar y bajar hasta el texto
  if (verDocumento && enCelular() && !enImagen && fuente) cambiarPestana("documento");
  const encontrado = enImagen ? false : marcarTextoEnDocumento(fuente);
  if (verDocumento && enCelular() && !encontrado) cambiarPestana("tabla");

  // En PDF o fotos (o en celular) se muestra la cita debajo de la fila
  if (fuente && (enImagen || (enCelular() && encontrado))) {
    const trc = document.querySelector(`#revision .fila-cita[data-cita="${i}"]`);
    const td = trc.querySelector("td");
    td.innerHTML = "";
    td.append(nodo("span", "cita-etiqueta", "En el documento dice: "), nodo("q", "", fuente));
    if (!enImagen && enCelular()) {
      const b = nodo("button", "boton enlace", "Ver en el documento");
      b.type = "button";
      b.addEventListener("click", (e) => { e.stopPropagation(); elegirFila(i, { verDocumento: true }); });
      td.append(" ", b);
    }
    trc.classList.remove("oculto");
  }
}

const normalizarLetra = (c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Arma el texto visible del documento con un mapa de vuelta a cada nodo de texto
function mapaDeTexto(raiz, sinPuntuacion) {
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  let texto = "";
  const mapa = [];
  const agregarEspacio = () => { if (texto && !texto.endsWith(" ")) { texto += " "; mapa.push(null); } };
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    if (n.parentElement?.closest(".hora")) continue;
    for (let k = 0; k < n.data.length; k++) {
      let c = normalizarLetra(n.data[k]);
      if (sinPuntuacion && !/[\p{L}\p{N}]/u.test(c)) c = " ";
      if (/\s/.test(c)) agregarEspacio();
      else { texto += c; mapa.push([n, k]); }
    }
    agregarEspacio();
  }
  return { texto, mapa };
}

function normalizarFragmento(s, sinPuntuacion) {
  let t = "";
  for (const ch of String(s)) {
    let c = normalizarLetra(ch);
    if (sinPuntuacion && !/[\p{L}\p{N}]/u.test(c)) c = " ";
    if (/\s/.test(c)) { if (t && !t.endsWith(" ")) t += " "; }
    else t += c;
  }
  return t.trim();
}

function limpiarMarcas() {
  if (window.CSS?.highlights) CSS.highlights.delete("fuyu-fuente");
  document.querySelectorAll(".fuente-marcada").forEach((e) => e.classList.remove("fuente-marcada"));
}

function llevarAVista(el) {
  const caja = $("#rev-documento");
  if (!el || !caja) return;
  if (enCelular()) { el.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  const delta = el.getBoundingClientRect().top - caja.getBoundingClientRect().top;
  caja.scrollTo({ top: caja.scrollTop + delta - 40, behavior: "smooth" });
}

// Marca en el documento el texto citado. Si no lo encuentra, no marca nada.
function marcarTextoEnDocumento(fragmento) {
  limpiarMarcas();
  const raiz = $("#rev-documento");
  if (!fragmento || !raiz || String(fragmento).trim().length < 3) return false;

  // Excel: se busca la fila completa
  const excel = raiz.querySelector(".doc-excel");
  if (excel) {
    const buscado = normalizarFragmento(fragmento, true);
    if (buscado.length < 3) return false;
    for (const tr of excel.querySelectorAll("tbody tr")) {
      const fila = normalizarFragmento([...tr.querySelectorAll("td")].map((td) => td.textContent).join(" "), true);
      if (fila && (fila.includes(buscado) || (buscado.includes(fila) && fila.length > 5))) {
        tr.classList.add("fuente-marcada");
        llevarAVista(tr);
        return true;
      }
    }
    return false;
  }

  for (const sinPuntuacion of [false, true]) {
    const { texto, mapa } = mapaDeTexto(raiz, sinPuntuacion);
    const buscado = normalizarFragmento(fragmento, sinPuntuacion);
    if (buscado.length < 3) continue;
    const pos = texto.indexOf(buscado);
    if (pos < 0) continue;
    let ini = pos, fin = pos + buscado.length - 1;
    while (ini <= fin && !mapa[ini]) ini++;
    while (fin >= ini && !mapa[fin]) fin--;
    if (ini > fin) continue;
    const rango = document.createRange();
    rango.setStart(mapa[ini][0], mapa[ini][1]);
    rango.setEnd(mapa[fin][0], mapa[fin][1] + 1);
    const elemento = rango.startContainer.parentElement;
    if (window.CSS?.highlights && window.Highlight) CSS.highlights.set("fuyu-fuente", new Highlight(rango));
    else elemento.classList.add("fuente-marcada");
    llevarAVista(elemento);
    return true;
  }
  return false;
}

// ---------------- Aprobación y descarga ----------------

// ---------------- Barra fija: aprobar y descargar ----------------

function textoPendientes() {
  const pendientes = problemasActuales();
  const rojos = pendientes.filter((p) => p.nivel === "rojo").length;
  if (!pendientes.length) return "Todo cuadra. Listo para aprobar.";
  if (rojos) return `${pendientes.length} ${pendientes.length === 1 ? "cosa" : "cosas"} para revisar · ${rojos} en rojo`;
  return `${pendientes.length} ${pendientes.length === 1 ? "cosa" : "cosas"} para revisar`;
}

function ponerBarra(modo) {
  const ver = (id, si) => $(id).classList.toggle("oculto", !si);
  const barra = $("#barra-aprobar");
  barra.dataset.modo = modo;
  ver("#btn-aprobar", modo === "revisar");
  ver("#btn-seguir", modo === "confirmar");
  ver("#btn-aprobar-igual", modo === "confirmar");
  ver("#btn-excel", modo === "aprobado");
  ver("#btn-csv", modo === "aprobado");
  if (modo === "revisar") $("#ba-estado").textContent = textoPendientes();
  if (modo === "confirmar") {
    const rojos = problemasActuales().filter((p) => p.nivel === "rojo").length;
    $("#ba-estado").textContent = `Quedan ${rojos} ${rojos === 1 ? "cosa" : "cosas"} en rojo. ¿Aprobar igual?`;
  }
  if (modo === "aprobado") $("#ba-estado").textContent = "✓ Aprobado. Descargue el archivo para su sistema.";
}

function mostrarBarra(si) {
  $("#barra-aprobar").classList.toggle("oculto", !si);
  document.body.classList.toggle("con-barra", si);
}

function desaprobar() {
  if (estado.aprobado) {
    estado.aprobado = false;
    $("#paso-3").classList.add("oculto");
  }
  if (!$("#barra-aprobar").classList.contains("oculto")) ponerBarra("revisar");
}

function aprobar() {
  const rojos = problemasActuales().filter((p) => p.nivel === "rojo").length;
  if (rojos) return ponerBarra("confirmar");
  confirmarAprobacion();
}

function confirmarAprobacion() {
  const rojos = problemasActuales().filter((p) => p.nivel === "rojo").length;
  estado.aprobado = true;
  const hora = new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
  $("#texto-aprobado").textContent = rojos
    ? `✓ Aprobado a las ${hora}, con ${rojos} ${rojos === 1 ? "cosa" : "cosas"} en rojo sin corregir.`
    : `✓ Aprobado a las ${hora}. Listo para cargar a su sistema.`;
  ponerBarra("aprobado");
  import(SHEETJS).catch(() => {}); // se precarga para que la descarga de Excel sea inmediata
  const cierre = $("#paso-3");
  cierre.classList.remove("oculto");
  cierre.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------------- Recorrido automático (para mostrar en una reunión) ----------------

class Detenido extends Error {}

async function pausa(ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (!estado.recorrido) throw new Detenido();
    await new Promise((ok) => setTimeout(ok, Math.min(150, fin - Date.now())));
  }
  if (!estado.recorrido) throw new Detenido();
}

function avisoRecorrido(texto) {
  $("#recorrido-texto").textContent = texto;
}

// Muestra dónde se va a tocar, y toca
async function tocar(el, { clic = true, espera = 700 } = {}) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  await pausa(espera);
  el.classList.add("recorrido-toque");
  await pausa(650);
  el.classList.remove("recorrido-toque");
  if (clic) el.click();
}

async function recorrido() {
  if (estado.recorrido) return;
  estado.recorrido = true;
  $("#recorrido-banda").classList.remove("oculto");
  document.body.classList.add("en-recorrido");
  try {
    avisoRecorrido("1 de 5 · Elegimos un pedido que llegó por WhatsApp");
    if (estado.modo !== "pedido") cambiarModo("pedido");
    const ej = EJEMPLOS.pedido.find((e) => e.tipo === "chat");
    await tocar(document.querySelector(`[data-archivo="${ej.archivo}"]`), { clic: false, espera: 900 });
    await elegirEjemplo(ej);
    await pausa(2600);

    avisoRecorrido("2 de 5 · Fuyu lo lee");
    await tocar($("#btn-leer-doc"), { clic: false });
    await leerConFuyu();
    if ($("#paso-2").classList.contains("oculto")) throw new Error("No se pudo leer el ejemplo.");
    await pausa(1800);

    avisoRecorrido("3 de 5 · Tocamos una fila y se marca de dónde salió");
    const filas = [...document.querySelectorAll("#revision .fila")];
    const fila = filas[Math.min(2, filas.length - 1)];
    if (fila) {
      await tocar(fila, { clic: false });
      elegirFila(Number(fila.dataset.linea), { verDocumento: true });
      if (!enCelular()) $("#rev-documento").scrollIntoView({ behavior: "smooth", block: "center" });
      await pausa(3200);
      if (enCelular()) { cambiarPestana("tabla"); await pausa(600); }
    }

    avisoRecorrido("4 de 5 · Corregimos lo marcado en un toque");
    for (let n = 0; n < 12; n++) {
      const boton = document.querySelector("#alertas .aviso-boton.principal")
        || [...document.querySelectorAll("#alertas .aviso-boton")].find((b) => b.textContent === "Dejar así");
      if (!boton) break;
      await tocar(boton);
      await pausa(900);
    }

    avisoRecorrido("5 de 5 · Aprobamos y descargamos para el sistema");
    await tocar($("#btn-aprobar"));
    if (!$("#btn-aprobar-igual").classList.contains("oculto")) await tocar($("#btn-aprobar-igual"));
    await pausa(1200);
    await tocar($("#btn-excel"), { clic: false, espera: 300 });
    await pausa(800);
    $("#paso-3").scrollIntoView({ behavior: "smooth", block: "center" });
    avisoRecorrido("Listo. Así se vería con sus propios pedidos.");
    await pausa(4000);
  } catch (e) {
    if (!(e instanceof Detenido)) mensaje(e.message || "El recorrido no pudo terminar.", "error");
  } finally {
    estado.recorrido = false;
    document.body.classList.remove("en-recorrido");
    $("#recorrido-banda").classList.add("oculto");
  }
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
      let s = v === null || v === undefined ? "" : String(v);
      if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...filas.map((f) => cols.map((c) => esc(f[c])).join(","))].join("\r\n");
    bajar(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
    return;
  }
  const boton = $("#btn-excel");
  const textoBoton = boton.textContent;
  boton.textContent = "Preparando Excel…";
  boton.disabled = true;
  let XLSX;
  try {
    XLSX = await import(SHEETJS);
  } catch {
    mensaje("No se pudo preparar el Excel. Revise su internet o descargue el CSV.", "error");
    return;
  } finally {
    boton.textContent = textoBoton;
    boton.disabled = false;
  }
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
