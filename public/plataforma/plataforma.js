// Plataforma de pedidos y ERP de la demo. Todo el texto que viene del servidor o de WhatsApp se pone con
// textContent (nunca como HTML), así un mensaje de un cliente no puede inyectar nada en la pantalla.

const $ = (s) => document.querySelector(s);
const TALLOS_POR_BONCHE = 25;
const FINCAS = { CAY: "Cayambe", TAB: "Tabacundo", LAT: "Latacunga" };

function el(tag, clase, texto, attrs) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto !== undefined && texto !== null) n.textContent = texto;
  if (attrs) for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
const dinero = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const miles = (n) => Number(n).toLocaleString("es-EC");
const hora = (ts) => (ts || "").slice(11, 16);
const fecha = (ts) => (ts || "").slice(0, 16).replace("T", " ");

let avisoTimer;
function aviso(texto) {
  const a = $("#aviso");
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (a.hidden = true), 4500);
}

async function api(ruta, opciones = {}) {
  const r = await fetch(`/api/plataforma${ruta}`, {
    ...opciones,
    headers: { "content-type": "application/json", ...(opciones.headers || {}) },
  });
  if (r.status === 401) {
    location.href = "/plataforma/entrar";
    throw new Error("Sesión vencida");
  }
  const j = await r.json().catch(() => ({ ok: false, error: "Respuesta inesperada del servidor." }));
  return { ok: r.ok && j.ok !== false, estado: r.status, ...j };
}

function tabla(cabeceras, filas, numericas = []) {
  const t = el("table");
  const cab = el("tr");
  cabeceras.forEach((c, i) => cab.append(el("th", numericas.includes(i) ? "num" : "", c)));
  const encabezado = el("thead");
  encabezado.append(cab);
  t.append(encabezado);
  const cuerpo = el("tbody");
  for (const f of filas) {
    const tr = el("tr");
    f.forEach((celda, i) => {
      const td = el("td", numericas.includes(i) ? "num" : "");
      if (celda instanceof Node) td.append(celda);
      else td.textContent = celda ?? "";
      tr.append(td);
    });
    cuerpo.append(tr);
  }
  t.append(cuerpo);
  const caja = el("div", "tabla-caja");
  caja.append(t);
  return caja;
}

// ---------- cifras ----------

async function cargarResumen() {
  const r = await api("/resumen");
  if (!r.ok) return;
  const p = r.pedidos || {};
  const k = $("#kpis");
  k.replaceChildren();
  const kpi = (valor, etiqueta, clase) => {
    const d = el("div", `kpi ${clase || ""}`);
    d.append(el("b", "", valor), el("span", "", etiqueta));
    k.append(d);
  };
  kpi(miles(p.PENDIENTE || 0), "Pedidos por aprobar", p.PENDIENTE ? "alerta" : "");
  kpi(miles(r.por_validar || 0), "Despachos por validar", r.por_validar ? "alerta" : "");
  kpi(miles(r.variedades), "Variedades de rosa");
  kpi(miles(r.productos), "Productos (variedad y largo)");
  kpi(miles(r.disponible), "Tallos disponibles");
  kpi(miles(r.reservado), "Tallos reservados");
  kpi(miles(r.clientes), "Clientes");
}

// ---------- pedidos ----------

function tablaLineas(lineas) {
  return tabla(
    ["Rosa", "Finca", "Tallos", "Bonches", "Precio", "Desc.", "Subtotal"],
    lineas.map((l) => [l.nombre, FINCAS[l.bodega] || l.bodega, miles(l.cantidad), miles(l.cantidad / TALLOS_POR_BONCHE), dinero(l.precio_unitario), `${l.descuento_pct}%`, dinero(l.subtotal)]),
    [2, 3, 4, 5, 6],
  );
}

function tablaMovimientos(movs) {
  return tabla(
    ["Finca", "Rosa", "Disponible antes → después", "Reservado"],
    movs.map((m) => {
      const cambio = el("span");
      cambio.append(document.createTextNode(`${miles(m.disponible_antes)} → `), el("span", "baja", miles(m.disponible_despues)));
      return [FINCAS[m.bodega] || m.bodega, m.sku, cambio, el("span", "sube", `+${miles(m.cantidad)} → ${miles(m.reservado_despues)}`)];
    }),
  );
}

function tarjetaPedido(p) {
  const c = el("article", "tarjeta");
  const cab = el("div", "pedido-cab");
  const izq = el("div");
  const id = el("div", "pedido-id", p.id);
  if (p.segmento === "Nuevo") id.append(" ", el("span", "badge nuevo", "Cliente nuevo"));
  izq.append(id, el("p", "pedido-meta", `${p.razon_social} · ${p.pais} · ${fecha(p.fecha)}${p.destino ? ` · Destino: ${p.destino}` : ""}`));
  izq.append(el("p", "pedido-meta", p.wa_id ? `Avisa por WhatsApp a +${p.wa_id}` : "Sin número de WhatsApp: no se podrá avisar al cliente"));
  const der = el("div");
  der.append(el("div", "total", dinero(p.total)));
  cab.append(izq, der);
  c.append(cab, tablaLineas(p.lineas));

  const acciones = el("div", "acciones");
  const aceptar = el("button", "boton verde", "Aceptar pedido", { type: "button" });
  const rechazar = el("button", "boton rojo", "Rechazar", { type: "button" });
  acciones.append(aceptar, rechazar);
  const motivo = el("textarea", "motivo", "", { placeholder: "Motivo del rechazo (opcional, se le envía al cliente)", rows: "2", maxlength: "200" });
  motivo.hidden = true;
  const confirmar = el("button", "boton rojo chico", "Confirmar rechazo", { type: "button" });
  confirmar.hidden = true;
  const resultado = el("div");
  c.append(acciones, motivo, resultado);
  acciones.append(confirmar);

  async function decidir(accion) {
    [aceptar, rechazar, confirmar].forEach((b) => (b.disabled = true));
    const r = await api("/pedidos/decidir", { method: "POST", body: JSON.stringify({ id: p.id, accion, usuario: "plataforma", motivo: motivo.value }) });
    resultado.replaceChildren();
    if (!r.ok) {
      resultado.append(el("div", "resultado mal", r.error || "No se pudo completar."));
      [aceptar, rechazar, confirmar].forEach((b) => (b.disabled = false));
      return;
    }
    acciones.hidden = true;
    motivo.hidden = true;
    const caja = el("div", "resultado ok");
    caja.append(el("b", "", accion === "aprobar" ? "Pedido aceptado. El stock se movió así:" : "Pedido rechazado. No se movió stock."));
    if (r.movimientos?.length) caja.append(tablaMovimientos(r.movimientos));
    caja.append(el("div", "", r.notificado ? "✓ El cliente recibió el aviso por WhatsApp." : `El cliente no recibió el aviso por WhatsApp (${r.motivo_no_notificado === "sin-configurar" ? "WhatsApp aún no está conectado a la plataforma" : r.motivo_no_notificado}).`));
    resultado.append(caja);
    cargarResumen();
    cargarHistorial();
  }
  aceptar.addEventListener("click", () => decidir("aprobar"));
  rechazar.addEventListener("click", () => { motivo.hidden = false; confirmar.hidden = false; rechazar.hidden = true; motivo.focus(); });
  confirmar.addEventListener("click", () => decidir("rechazar"));
  return c;
}

let firmaPendientes = "";
async function cargarPendientes(forzar = false) {
  const r = await api("/pedidos?estado=PENDIENTE");
  const caja = $("#pendientes");
  if (!r.ok) return;
  // No se repinta mientras alguien está decidiendo un pedido (se perdería lo que escribió)...
  if (!forzar && caja.querySelector(".motivo:not([hidden]), .resultado.ok, .resultado.mal")) return;
  // ...ni si no cambió nada: así el botón no se mueve justo cuando alguien lo va a pulsar
  const firma = r.pedidos.map((p) => p.id).join("|");
  if (!forzar && firma === firmaPendientes && caja.children.length) return;
  firmaPendientes = firma;
  caja.replaceChildren();
  if (!r.pedidos.length) {
    const v = el("div", "tarjeta");
    v.append(el("p", "vacio", "No hay pedidos por aprobar. Cuando un cliente confirme un pedido por WhatsApp aparecerá aquí."));
    caja.append(v);
    return;
  }
  r.pedidos.forEach((p) => caja.append(tarjetaPedido(p)));
}

async function cargarHistorial() {
  const r = await api("/pedidos?limite=30");
  if (!r.ok) return;
  const caja = $("#historial");
  caja.replaceChildren();
  if (!r.pedidos.length) return caja.append(el("p", "vacio", "Todavía no hay pedidos decididos."));
  caja.append(tabla(
    ["Pedido", "Fecha", "Cliente", "Estado", "Total", "Decidió"],
    r.pedidos.map((p) => [p.id, fecha(p.fecha), p.razon_social, el("span", `badge ${p.estado}`, p.estado), dinero(p.total), p.aprobado_por || ""]),
    [4],
  ));
}

// ---------- despachos ----------

const ESTADO_DESPACHO = {
  FALTAN_DATOS: "Esperando datos del cliente",
  POR_VALIDAR: "Por validar",
  DEVUELTO: "Devuelto al cliente",
  VALIDADO: "Validado: listo para despachar",
  DESPACHADO: "Despachado",
};

function tarjetaDespacho(d) {
  const c = el("article", "tarjeta");
  const cab = el("div", "pedido-cab");
  const izq = el("div");
  const id = el("div", "pedido-id", d.pedido_id);
  id.append(" ", el("span", `badge ${d.estado}`, ESTADO_DESPACHO[d.estado] || d.estado));
  izq.append(id, el("p", "pedido-meta", `${d.razon_social}${d.destino ? ` · Destino del pedido: ${d.destino}` : ""}`));
  const der = el("div");
  der.append(el("div", "total", dinero(d.total)));
  cab.append(izq, der);
  c.append(cab);

  if (d.estado === "FALTAN_DATOS") {
    c.append(el("p", "nota", "El agente ya le pidió al cliente los datos de entrega por WhatsApp. Cuando los envíe, aparecerán aquí para validarlos."));
    return c;
  }
  c.append(tabla(["Recibe", "Teléfono", "Dirección", "Ciudad", "Entrega", "Pago"],
    [[d.contacto_nombre, d.contacto_telefono, d.direccion, d.ciudad, d.fecha_entrega, d.metodo_pago_texto || d.metodo_pago]]));
  if (d.transportista) c.append(el("p", "pedido-meta", `Transportista: ${d.transportista}${d.referencia_pago ? ` · Referencia de pago: ${d.referencia_pago}` : ""}`));
  if (d.metodo_pago === "credito") c.append(el("p", "pedido-meta", `Crédito disponible del cliente: ${dinero(d.credito_disponible_calc)}`));
  if (d.estado === "DEVUELTO") {
    c.append(el("div", "resultado mal", `Devuelto al cliente: ${d.motivo_devolucion}. Está esperando que lo corrija por WhatsApp.`));
    return c;
  }

  const transportista = el("input", "buscador", "", { type: "text", placeholder: "Transportista (obligatorio para validar)", maxlength: "80", "aria-label": "Transportista" });
  const referencia = el("input", "buscador", "", { type: "text", placeholder: "Referencia de pago o comprobante (opcional)", maxlength: "80", "aria-label": "Referencia de pago" });
  const motivo = el("textarea", "motivo", "", { placeholder: "Qué debe corregir el cliente (se le envía por WhatsApp)", rows: "2", maxlength: "300" });
  motivo.hidden = true;
  const acciones = el("div", "acciones");
  const validar = el("button", "boton verde", "Validar datos", { type: "button" });
  const despachar = el("button", "boton verde", "Marcar despachado", { type: "button" });
  const devolver = el("button", "boton rojo", "Devolver al cliente", { type: "button" });
  const confirmar = el("button", "boton rojo chico", "Enviar devolución", { type: "button" });
  confirmar.hidden = true;
  const resultado = el("div");
  if (d.estado === "POR_VALIDAR") { c.append(transportista, referencia); acciones.append(validar, devolver, confirmar); }
  else { acciones.append(despachar, devolver, confirmar); }
  c.append(acciones, motivo, resultado);

  async function enviar(accion) {
    [validar, despachar, devolver, confirmar].forEach((b) => (b.disabled = true));
    const r = await api("/despachos/accion", { method: "POST", body: JSON.stringify({ id: d.pedido_id, accion, usuario: "plataforma", motivo: motivo.value, transportista: transportista.value, referencia: referencia.value }) });
    resultado.replaceChildren();
    if (!r.ok) {
      resultado.append(el("div", "resultado mal", r.error || "No se pudo completar."));
      [validar, despachar, devolver, confirmar].forEach((b) => (b.disabled = false));
      return;
    }
    acciones.hidden = true;
    motivo.hidden = true;
    const caja = el("div", "resultado ok");
    caja.append(el("b", "", { validar: "Datos validados.", devolver: "Devuelto al cliente para corregir.", despachar: "Despachado. El stock se movió así:" }[accion]));
    if (r.movimientos?.length) {
      caja.append(tabla(["Finca", "Rosa", "Disponible", "Reservado"], r.movimientos.map((m) => [FINCAS[m.bodega] || m.bodega, m.sku, miles(m.disponible_despues), `−${miles(m.cantidad)} → ${miles(m.reservado_despues)}`]), [2, 3]));
    }
    caja.append(el("div", "", r.notificado ? "✓ El cliente recibió el aviso por WhatsApp." : `El cliente no recibió el aviso por WhatsApp (${r.motivo_no_notificado === "sin-configurar" ? "WhatsApp aún no está conectado a la plataforma" : r.motivo_no_notificado}).`));
    resultado.append(caja);
    cargarResumen();
    cargarDespachados();
  }
  validar.addEventListener("click", () => enviar("validar"));
  despachar.addEventListener("click", () => enviar("despachar"));
  devolver.addEventListener("click", () => { motivo.hidden = false; confirmar.hidden = false; devolver.hidden = true; motivo.focus(); });
  confirmar.addEventListener("click", () => enviar("devolver"));
  return c;
}

let firmaDespachos = "";
async function cargarDespachos(forzar = false) {
  const r = await api("/despachos?limite=100");
  if (!r.ok) return;
  const caja = $("#despachos");
  // Igual que con los pedidos: no se repinta mientras alguien escribe o ve un resultado, ni si nada cambió
  if (!forzar && caja.querySelector(".motivo:not([hidden]), .resultado.ok, .resultado.mal, input:focus")) return;
  const activos = r.despachos.filter((d) => d.estado !== "DESPACHADO");
  const firma = activos.map((d) => `${d.pedido_id}:${d.estado}`).join("|");
  if (!forzar && firma === firmaDespachos && caja.children.length) { pintarDespachados(r.despachos); return; }
  firmaDespachos = firma;
  caja.replaceChildren();
  if (!activos.length) {
    const v = el("div", "tarjeta");
    v.append(el("p", "vacio", "No hay despachos pendientes. Cuando acepte un pedido, aquí seguirá el proceso hasta la salida de la flor."));
    caja.append(v);
  } else activos.forEach((d) => caja.append(tarjetaDespacho(d)));
  pintarDespachados(r.despachos);
}

function pintarDespachados(todos) {
  const caja = $("#despachados");
  caja.replaceChildren();
  const hechos = todos.filter((d) => d.estado === "DESPACHADO");
  if (!hechos.length) return caja.append(el("p", "vacio", "Todavía no hay despachos."));
  caja.append(tabla(["Pedido", "Cliente", "Ciudad", "Entrega", "Pago", "Transportista", "Total"],
    hechos.map((d) => [d.pedido_id, d.razon_social, d.ciudad, d.fecha_entrega, d.metodo_pago_texto || "", d.transportista || "", dinero(d.total)]), [6]));
}
const cargarDespachados = () => cargarDespachos(true);

// ---------- ERP ----------

let busqueda;
async function erpInventario() {
  const c = $("#erp-contenido");
  c.replaceChildren();
  c.append(el("p", "nota", "Cada rosa tiene stock “disponible” y “reservado” en tres fincas. Al aceptar un pedido, la cantidad pasa de disponible a reservado en la finca del pedido."));
  const q = el("input", "buscador", "", { type: "search", placeholder: "Buscar rosa: Freedom, Explorer 60…", "aria-label": "Buscar rosa" });
  const lista = el("div");
  c.append(q, lista);
  async function buscar() {
    const r = await api(`/inventario?limite=40&q=${encodeURIComponent(q.value)}`);
    lista.replaceChildren();
    if (!r.ok) return;
    if (!r.productos.length) return lista.append(el("p", "vacio", "No hay rosas con ese nombre."));
    const celda = (f) => (f ? el("span", "", `${miles(f.disponible)}${f.reservado ? ` (${miles(f.reservado)} reservados)` : ""}`) : "");
    lista.append(tabla(
      ["Rosa", "SKU", "Precio por tallo", "Cayambe", "Tabacundo", "Latacunga"],
      r.productos.map((p) => [p.nombre, p.sku, dinero(p.precio_unitario), celda(p.fincas.CAY), celda(p.fincas.TAB), celda(p.fincas.LAT)]),
      [2, 3, 4, 5],
    ));
  }
  q.addEventListener("input", () => { clearTimeout(busqueda); busqueda = setTimeout(buscar, 300); });
  buscar();
}

async function erpMovimientos() {
  const c = $("#erp-contenido");
  c.replaceChildren(el("p", "nota", "Cada vez que se acepta un pedido queda anotado cuánta flor salió de “disponible” y entró a “reservado”, y de qué pedido."));
  const r = await api("/movimientos?limite=60");
  if (!r.ok) return;
  if (!r.movimientos.length) return c.append(el("p", "vacio", "Todavía no hay movimientos. Acepte un pedido y aparecerá aquí."));
  c.append(tabla(
    ["Fecha", "Pedido", "Rosa", "Finca", "Cantidad", "Disponible antes → después", "Reservado"],
    r.movimientos.map((m) => [fecha(m.ts), m.pedido_id || "", m.nombre || m.sku, FINCAS[m.bodega] || m.bodega, miles(m.cantidad), `${miles(m.disponible_antes)} → ${miles(m.disponible_despues)}`, miles(m.reservado_despues)]),
    [4, 5, 6],
  ));
}

async function erpClientes() {
  const c = $("#erp-contenido");
  c.replaceChildren();
  const r = await api("/clientes");
  if (!r.ok) return;
  c.append(tabla(
    ["ID", "Cliente", "País", "WhatsApp", "Segmento", "Crédito disponible", "Descuento máx."],
    r.clientes.map((x) => [x.id, x.razon_social, x.pais, x.whatsapp, x.segmento, dinero(x.limite_credito - x.saldo_pendiente), `${x.descuento_max}%`]),
    [5, 6],
  ));
}

async function erpAuditoria() {
  const c = $("#erp-contenido");
  c.replaceChildren(el("p", "nota", "Registro de lo que hicieron el agente y las personas: pedidos pendientes, aceptados o rechazados, clientes nuevos."));
  const r = await api("/auditoria?limite=60");
  if (!r.ok) return;
  c.append(tabla(["Fecha", "Quién", "Acción", "Resultado"], r.auditoria.map((a) => [fecha(a.timestamp), a.usuario, a.accion, a.resultado || ""])));
}

const ERP = { inventario: erpInventario, movimientos: erpMovimientos, clientes: erpClientes, auditoria: erpAuditoria };
let erpActual = "inventario";
function mostrarErp(cual) {
  erpActual = cual;
  document.querySelectorAll(".subpestana").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.erp === cual)));
  ERP[cual]();
}

// ---------- conversaciones ----------

async function cargarChats() {
  const r = await api("/conversaciones");
  const lista = $("#lista-chats");
  lista.replaceChildren();
  if (!r.ok) return;
  if (!r.conversaciones.length) {
    lista.append(el("li", "vacio", "Todavía no hay conversaciones."));
    return;
  }
  for (const c of r.conversaciones) {
    const li = el("li");
    const b = el("button", "", "", { type: "button" });
    b.append(el("b", "", c.cliente || `+${c.wa_id}`), el("span", "", c.ultimo));
    b.addEventListener("click", () => { lista.querySelectorAll("button").forEach((x) => x.removeAttribute("aria-current")); b.setAttribute("aria-current", "true"); abrirChat(c.wa_id); });
    li.append(b);
    lista.append(li);
  }
}

async function abrirChat(wa) {
  const r = await api(`/conversacion?wa=${encodeURIComponent(wa)}`);
  const chat = $("#chat");
  chat.replaceChildren();
  if (!r.ok) return;
  for (const m of r.mensajes) {
    const b = el("p", `burbuja ${m.rol === "cliente" ? "cliente" : "agente"}`, m.texto);
    b.append(el("span", "hora", hora(m.ts)));
    chat.append(b);
    if (m.traza?.length) {
      const t = el("div", "traza");
      t.append(el("b", "", "Cómo respondió el agente"));
      for (const p of m.traza) t.append(el("div", "", `${p.ok === false ? "⛔" : "✓"} ${String(p.nodo).replace("tool:", "herramienta ")} — ${p.detalle}`));
      chat.append(t);
    }
  }
  chat.scrollTop = chat.scrollHeight;
}

// ---------- pestañas y arranque ----------

function mostrarVista(v) {
  document.querySelectorAll(".pestana").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.vista === v)));
  for (const nombre of ["pedidos", "despachos", "erp", "chats"]) $(`#vista-${nombre}`).hidden = nombre !== v;
  if (v === "pedidos") { cargarPendientes(); cargarHistorial(); }
  if (v === "despachos") cargarDespachos(true);
  if (v === "erp") mostrarErp(erpActual);
  if (v === "chats") cargarChats();
}

document.querySelectorAll(".pestana").forEach((b) => b.addEventListener("click", () => mostrarVista(b.dataset.vista)));
document.querySelectorAll(".subpestana").forEach((b) => b.addEventListener("click", () => mostrarErp(b.dataset.erp)));
$("#actualizar").addEventListener("click", () => { cargarResumen(); cargarPendientes(true); cargarHistorial(); aviso("Actualizado"); });
$("#salir").addEventListener("click", async () => {
  await fetch("/api/plataforma/salir", { method: "POST" });
  location.href = "/plataforma/entrar";
});

cargarResumen();
cargarPendientes();
cargarHistorial();
// Los pedidos nuevos aparecen solos mientras la pestaña está a la vista
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  if (!$("#vista-pedidos").hidden) { cargarResumen(); cargarPendientes(); }
  if (!$("#vista-despachos").hidden) { cargarResumen(); cargarDespachos(); }
}, 15000);
