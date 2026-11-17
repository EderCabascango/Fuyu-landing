// ERP básico de la demo (Cloudflare D1) y la API de la plataforma.
//
// Dos puertas, cada una con su llave:
//   /api/erp/*         → lo usa el agente de ventas. Entra con un token (secreto ERP_TOKEN).
//   /api/plataforma/*  → lo usa la persona que revisa pedidos. Entra con contraseña y una sesión firmada.
//
// Reglas que el código hace cumplir, no el agente:
//   - Un pedido pendiente solo se acepta con precios del ERP y stock que alcance.
//   - Aceptar un pedido mueve la flor de "disponible" a "reservado" en su finca, todo o nada.
//   - Un pedido se decide una sola vez (aunque lo toquen dos personas a la vez).
//   - Un pedido aceptado se despacha solo con datos de entrega validados por un asesor; al despachar baja lo reservado.

import { claveCorrecta, configurado, crearCookie, cookieVencida, sesionValida } from "./sesion.js";

const BODEGAS = ["CAY", "TAB", "LAT"];
const TALLOS_POR_BONCHE = 25;
const MAX_CUERPO = 256 * 1024;
const MAX_LINEAS = 50;
const CODIFICAR = new TextEncoder();

// ---------- utilidades ----------

const json = (datos, estado = 200) =>
  new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
const fallo = (mensaje, estado = 400) => json({ ok: false, error: mensaje }, estado);

// Hora de Ecuador (UTC-5), como texto
const ahora = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
const digitos = (s) => String(s ?? "").replace(/\D/g, "");
const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const texto = (v, max = 500) => String(v ?? "").slice(0, max);

async function cuerpoJson(request) {
  const declarado = Number(request.headers.get("content-length") || 0);
  if (declarado > MAX_CUERPO) return { error: fallo("Cuerpo demasiado grande.", 413) };
  const bruto = await request.text();
  if (bruto.length > MAX_CUERPO) return { error: fallo("Cuerpo demasiado grande.", 413) };
  try {
    const d = JSON.parse(bruto || "{}");
    return d && typeof d === "object" ? { d } : { error: fallo("Formato no válido.", 400) };
  } catch {
    return { error: fallo("No se pudo leer lo enviado.", 400) };
  }
}

async function igualesSeguro(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", CODIFICAR.encode(a)), crypto.subtle.digest("SHA-256", CODIFICAR.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

async function tokenValido(request, env) {
  const t = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t || !env.ERP_TOKEN || env.ERP_TOKEN.length < 32) return false;
  return igualesSeguro(t, env.ERP_TOKEN);
}

function mismoOrigen(request) {
  const origen = request.headers.get("origin");
  try { return !!origen && new URL(origen).host === new URL(request.url).host; } catch { return false; }
}

const todos = async (env, sql, ...params) => (await env.ERP.prepare(sql).bind(...params).all()).results || [];
const uno = async (env, sql, ...params) => (await env.ERP.prepare(sql).bind(...params).first()) || null;

async function auditar(env, usuario, accion, payload, resultado) {
  await env.ERP.prepare("INSERT INTO auditoria (timestamp, usuario, accion, payload_json, resultado) VALUES (?,?,?,?,?)")
    .bind(ahora(), texto(usuario, 80), texto(accion, 80), JSON.stringify(payload ?? {}).slice(0, 4000), texto(resultado, 300)).run();
}

// ---------- clientes ----------

async function buscarCliente(env, q) {
  q = String(q ?? "").trim();
  if (!q) return null;
  let c = await uno(env, "SELECT * FROM clientes WHERE upper(id)=upper(?1) OR ruc=?1", q);
  if (!c) {
    const d = digitos(q);
    const lista = await todos(env, "SELECT * FROM clientes");
    if (d.length >= 8) c = lista.find((x) => digitos(x.whatsapp) === d) || null;
    if (!c) {
      const nq = normalizar(q);
      c = nq ? lista.find((x) => normalizar(x.razon_social).includes(nq)) || null : null;
    }
  }
  return c ? { ...c, credito_disponible: redondear(c.limite_credito - c.saldo_pendiente) } : null;
}

// ---------- puerta del agente: /api/erp/* ----------

async function erpAgente(request, env, url) {
  if (!env.ERP) return fallo("El ERP no está configurado.", 503);
  if (!(await tokenValido(request, env))) return fallo("No autorizado.", 401);
  const ruta = url.pathname.replace(/^\/api\/erp/, "");
  const metodo = request.method;

  if (ruta === "/productos" && metodo === "GET") {
    return json({ ok: true, productos: await todos(env, "SELECT sku, nombre, categoria, precio_unitario, unidad FROM productos ORDER BY sku") });
  }
  if (ruta === "/inventario" && metodo === "GET") {
    const sku = texto(url.searchParams.get("sku"), 40);
    return json({ ok: true, inventario: await todos(env, "SELECT bodega, stock_disponible, stock_reservado FROM inventario WHERE upper(sku)=upper(?) ORDER BY stock_disponible DESC", sku) });
  }
  if (ruta === "/clientes" && metodo === "GET") {
    return json({ ok: true, cliente: await buscarCliente(env, url.searchParams.get("q")) });
  }
  if (ruta === "/clientes/whatsapp" && metodo === "POST") return registrarClienteWhatsapp(request, env);
  if (ruta === "/pedidos/pendiente" && metodo === "POST") return crearPedidoPendiente(request, env);
  if (ruta === "/despachos/pendientes" && metodo === "GET") {
    const wa = digitos(url.searchParams.get("wa"));
    if (wa.length < 8) return fallo("Número no válido.", 400);
    return json({ ok: true, despachos: await despachosPendientesDe(env, wa) });
  }
  if (ruta === "/despachos" && metodo === "POST") return guardarDatosDespacho(request, env);
  if (ruta === "/auditoria" && metodo === "POST") {
    const { d, error } = await cuerpoJson(request);
    if (error) return error;
    await auditar(env, d.usuario || "agente", d.accion || "EVENTO", d.payload, d.resultado);
    return json({ ok: true });
  }
  if (ruta === "/mensajes" && metodo === "POST") {
    const { d, error } = await cuerpoJson(request);
    if (error) return error;
    const wa = digitos(d.wa_id);
    if (wa.length < 8 || wa.length > 16 || !["cliente", "agente"].includes(d.rol)) return fallo("Mensaje no válido.", 400);
    await env.ERP.prepare("INSERT INTO mensajes (wa_id, rol, texto, ts, traza_json) VALUES (?,?,?,?,?)")
      .bind(wa, d.rol, texto(d.texto, 4000), ahora(), d.traza ? JSON.stringify(d.traza).slice(0, 6000) : null).run();
    return json({ ok: true });
  }
  return fallo("No encontrado.", 404);
}

async function registrarClienteWhatsapp(request, env) {
  const { d, error } = await cuerpoJson(request);
  if (error) return error;
  const wa = digitos(d.wa_id);
  if (wa.length < 8 || wa.length > 16) return fallo("Número de WhatsApp no válido.", 400);
  const id = `W${wa}`;
  const limite = Number(d.limite_credito ?? 2000);
  const descuento = Number(d.descuento_max ?? 0);
  if (!(limite >= 0 && limite <= 1e6) || !(descuento >= 0 && descuento <= 30)) return fallo("Condiciones no válidas.", 400);
  const nombre = texto(d.nombre, 60).replace(/\s+/g, " ").trim() || "Cliente";
  const ya = await uno(env, "SELECT id FROM clientes WHERE id=?", id);
  if (!ya) {
    await env.ERP.prepare("INSERT OR IGNORE INTO clientes (id, razon_social, ruc, pais, whatsapp, limite_credito, saldo_pendiente, segmento, descuento_max) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, `${nombre} (WhatsApp +${wa})`, `WA-${wa}`, texto(d.pais, 40) || "Por confirmar", `+${wa}`, limite, 0, "Nuevo", descuento).run();
    await auditar(env, "canal-whatsapp", "CLIENTE_REGISTRADO_WHATSAPP", { id, nombre, limite_credito: limite, descuento_max: descuento }, "Cliente nuevo atendido sin registro previo");
  }
  return json({ ok: true, id, nuevo: !ya });
}

// El agente ya validó el pedido; aquí se vuelve a comprobar todo contra el ERP antes de guardarlo como pendiente.
async function crearPedidoPendiente(request, env) {
  const { d, error } = await cuerpoJson(request);
  if (error) return error;
  const cliente = await buscarCliente(env, d.cliente_id);
  if (!cliente) return fallo("El cliente no existe en el ERP.", 422);
  const lineas = Array.isArray(d.lineas) ? d.lineas : [];
  if (!lineas.length || lineas.length > MAX_LINEAS) return fallo("El pedido no tiene líneas válidas.", 422);

  const detalle = [];
  for (const l of lineas) {
    const sku = texto(l.sku, 40).toUpperCase();
    const bodega = texto(l.bodega, 8).toUpperCase();
    const cantidad = Number(l.cantidad);
    const desc = Number(l.descuento_pct ?? 0);
    const p = await uno(env, "SELECT sku, nombre, precio_unitario FROM productos WHERE sku=?", sku);
    if (!p) return fallo(`El producto ${sku} no existe.`, 422);
    if (!BODEGAS.includes(bodega)) return fallo(`La finca ${bodega} no existe.`, 422);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad % TALLOS_POR_BONCHE) return fallo(`${sku}: la cantidad debe ser de bonches completos de ${TALLOS_POR_BONCHE} tallos.`, 422);
    if (Math.abs(Number(l.precio_unitario) - p.precio_unitario) > 0.005) return fallo(`${sku}: el precio no coincide con el del ERP ($${p.precio_unitario.toFixed(2)}).`, 422);
    if (!(desc >= 0 && desc <= cliente.descuento_max + 1e-9)) return fallo(`${sku}: el descuento supera el máximo del cliente (${cliente.descuento_max}%).`, 422);
    detalle.push({ sku, bodega, cantidad, precio: p.precio_unitario, desc, subtotal: redondear(cantidad * p.precio_unitario * (1 - desc / 100)) });
  }
  const total = redondear(detalle.reduce((a, x) => a + x.subtotal, 0));
  if (total > cliente.credito_disponible + 1e-6) return fallo("El total supera el crédito disponible del cliente.", 422);

  const wa = digitos(d.wa_id);
  for (let intento = 0; intento < 4; intento++) {
    const { n } = await uno(env, "SELECT COALESCE(MAX(CAST(SUBSTR(id, 5) AS INTEGER)), 0) + 1 AS n FROM pedidos");
    const id = `PED-${String(n).padStart(4, "0")}`;
    try {
      await env.ERP.batch([
        env.ERP.prepare("INSERT INTO pedidos (id, cliente_id, estado, total, creado_por, aprobado_por, fecha, wa_id, destino) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(id, cliente.id, "PENDIENTE", total, texto(d.creado_por, 60) || "agente-ia", null, ahora(), wa || null, texto(d.destino, 120) || null),
        ...detalle.map((x) => env.ERP.prepare("INSERT INTO pedido_detalle (pedido_id, sku, bodega, cantidad, precio_unitario, descuento_pct, subtotal) VALUES (?,?,?,?,?,?,?)")
          .bind(id, x.sku, x.bodega, x.cantidad, x.precio, x.desc, x.subtotal)),
        env.ERP.prepare("INSERT INTO auditoria (timestamp, usuario, accion, payload_json, resultado) VALUES (?,?,?,?,?)")
          .bind(ahora(), "agente-ia", "PEDIDO_PENDIENTE", JSON.stringify({ pedido_id: id, cliente_id: cliente.id, total }), "Esperando aprobación en la plataforma"),
      ]);
      return json({ ok: true, pedido_id: id, total, cliente_id: cliente.id });
    } catch (e) {
      if (!/UNIQUE|PRIMARY/i.test(String(e))) throw e; // otro pedido tomó ese número: se prueba con el siguiente
    }
  }
  return fallo("No se pudo numerar el pedido. Intente de nuevo.", 409);
}

// ---------- aviso por WhatsApp desde la plataforma ----------

async function enviarWhatsapp(env, para, cuerpo) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID || !para) return { ok: false, motivo: "sin-configurar" };
  try {
    const r = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION || "v23.0"}/${env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { preview_url: false, body: cuerpo.slice(0, 4000) } }),
    });
    if (r.ok) return { ok: true };
    const detalle = await r.text();
    let codigo = null;
    try { codigo = JSON.parse(detalle)?.error?.code; } catch {}
    console.log("WhatsApp respondió", r.status, detalle.slice(0, 200));
    return { ok: false, motivo: codigo === 131047 ? "ventana" : codigo === 190 ? "token" : "error" };
  } catch (e) {
    console.log("No se pudo conectar con WhatsApp:", String(e).slice(0, 200));
    return { ok: false, motivo: "conexion" };
  }
}

const dinero = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function lineasParaCliente(lineas) {
  return lineas.map((l) => `• ${l.cantidad} tallos (${l.cantidad / TALLOS_POR_BONCHE} bonches) ${l.nombre}: ${dinero(l.precio_unitario)} c/u${l.descuento_pct ? `, ${l.descuento_pct}% de descuento` : ""} = ${dinero(l.subtotal)}`).join("\n");
}

// ---------- despachos: lo que pasa después de aceptar un pedido ----------
// El agente le pide los datos al cliente por WhatsApp, el servidor los valida y un asesor los revisa
// en la plataforma. Solo con datos validados se puede despachar, y al despachar baja lo reservado.

const METODOS_PAGO = { transferencia: "Transferencia", credito: "Crédito", contra_entrega: "Contra entrega", efectivo: "Efectivo" };
const DATOS_DESPACHO = "nombre y teléfono de quien recibe, dirección y ciudad de entrega, fecha de entrega y método de pago (transferencia, crédito, contra entrega o efectivo)";

const hoyEcuador = () => ahora().slice(0, 10);
const sumarDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const limpio = (v, max) => texto(v, max).replace(/\s+/g, " ").trim();

function metodoPago(v) {
  const m = normalizar(v).replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (METODOS_PAGO[m]) return m;
  if (m === "contraentrega" || m === "contra_entrega" || m === "pago_contra_entrega") return "contra_entrega";
  if (m === "transferencia_bancaria" || m === "deposito") return "transferencia";
  return null;
}

// Devuelve { datos } o { error } con un mensaje que el agente puede repetirle al cliente.
function validarDatosDespacho(d, cliente, pedido) {
  const nombre = limpio(d.contacto_nombre, 80);
  const telefono = digitos(d.contacto_telefono);
  const direccion = limpio(d.direccion, 200);
  const ciudad = limpio(d.ciudad, 60);
  const fecha = limpio(d.fecha_entrega, 10);
  const metodo = metodoPago(d.metodo_pago);
  if (nombre.length < 3) return { error: "Falta el nombre de quien recibe." };
  if (telefono.length < 7 || telefono.length > 15) return { error: "El teléfono de contacto no es válido (entre 7 y 15 dígitos)." };
  if (direccion.length < 8) return { error: "La dirección de entrega está incompleta (calle, número y referencia)." };
  if (ciudad.length < 2) return { error: "Falta la ciudad de entrega." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`)) || new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha) {
    return { error: "La fecha de entrega debe tener el formato AAAA-MM-DD." };
  }
  const hoy = hoyEcuador();
  if (fecha < hoy) return { error: "La fecha de entrega no puede ser anterior a hoy." };
  if (fecha > sumarDias(hoy, 90)) return { error: "La fecha de entrega no puede pasar de 90 días." };
  if (!metodo) return { error: "El método de pago debe ser transferencia, crédito, contra entrega o efectivo." };
  if (metodo === "credito" && pedido.total > cliente.credito_disponible + 1e-6) {
    return { error: `El total ($${pedido.total.toFixed(2)}) supera el crédito disponible ($${cliente.credito_disponible.toFixed(2)}). Elija otro método de pago.` };
  }
  return { datos: { contacto_nombre: nombre, contacto_telefono: telefono, direccion, ciudad, fecha_entrega: fecha, metodo_pago: metodo } };
}

// Pedidos aceptados de un número que todavía no salieron, con el estado de sus datos de despacho.
async function despachosPendientesDe(env, wa) {
  const filas = await todos(env,
    "SELECT p.id, p.total, p.destino, d.estado AS d_estado, d.motivo_devolucion, d.fecha_entrega, d.ciudad, d.metodo_pago FROM pedidos p LEFT JOIN despachos d ON d.pedido_id=p.id WHERE p.estado='APROBADO' AND p.wa_id=? AND COALESCE(d.estado,'') <> 'DESPACHADO' ORDER BY p.id DESC LIMIT 5", wa);
  return filas.map((f) => ({
    pedido_id: f.id, total: f.total, destino: f.destino,
    estado: f.d_estado || "FALTAN_DATOS", motivo_devolucion: f.motivo_devolucion || null,
    ...(f.d_estado ? { fecha_entrega: f.fecha_entrega, ciudad: f.ciudad, metodo_pago: f.metodo_pago } : {}),
  }));
}

async function guardarDatosDespacho(request, env) {
  const { d, error } = await cuerpoJson(request);
  if (error) return error;
  const wa = digitos(d.wa_id);
  const id = String(d.pedido_id ?? "");
  if (!/^PED-\d{4,}$/.test(id) || wa.length < 8) return fallo("Pedido o número no válido.", 400);
  const pedido = await uno(env, "SELECT * FROM pedidos WHERE id=?", id);
  if (!pedido || pedido.wa_id !== wa) return fallo("Ese pedido no está a nombre de este número.", 404);
  if (pedido.estado !== "APROBADO") return fallo("Solo se piden datos de despacho de pedidos aceptados.", 409);
  const actual = await uno(env, "SELECT estado FROM despachos WHERE pedido_id=?", id);
  if (actual && !["POR_VALIDAR", "DEVUELTO"].includes(actual.estado)) {
    return fallo(actual.estado === "DESPACHADO" ? "Ese pedido ya fue despachado." : "Los datos ya fueron validados por un asesor; para cambiarlos hable con él.", 409);
  }
  const cliente = await buscarCliente(env, pedido.cliente_id);
  const v = validarDatosDespacho(d, cliente, pedido);
  if (v.error) return fallo(v.error, 422);
  const x = v.datos;
  const cuando = ahora();
  await env.ERP.batch([
    env.ERP.prepare("INSERT INTO despachos (pedido_id, estado, contacto_nombre, contacto_telefono, direccion, ciudad, fecha_entrega, metodo_pago, creado, actualizado) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(pedido_id) DO UPDATE SET estado='POR_VALIDAR', contacto_nombre=excluded.contacto_nombre, contacto_telefono=excluded.contacto_telefono, direccion=excluded.direccion, ciudad=excluded.ciudad, fecha_entrega=excluded.fecha_entrega, metodo_pago=excluded.metodo_pago, motivo_devolucion=NULL, actualizado=excluded.actualizado WHERE despachos.estado IN ('POR_VALIDAR','DEVUELTO')")
      .bind(id, "POR_VALIDAR", x.contacto_nombre, x.contacto_telefono, x.direccion, x.ciudad, x.fecha_entrega, x.metodo_pago, cuando, cuando),
    env.ERP.prepare("INSERT INTO auditoria (timestamp, usuario, accion, payload_json, resultado) VALUES (?,?,?,?,?)")
      .bind(cuando, "agente-ia", "DESPACHO_DATOS_RECIBIDOS", JSON.stringify({ pedido_id: id, ciudad: x.ciudad, fecha_entrega: x.fecha_entrega, metodo_pago: x.metodo_pago }), "Esperando validación de un asesor"),
  ]);
  return json({ ok: true, pedido_id: id, estado: "POR_VALIDAR", metodo_pago: METODOS_PAGO[x.metodo_pago] });
}

// Avisa al cliente por WhatsApp y deja el aviso en su conversación
async function avisarCliente(env, wa, aviso, detalle, ok = true) {
  const enviado = await enviarWhatsapp(env, wa, aviso);
  if (wa) {
    await env.ERP.prepare("INSERT INTO mensajes (wa_id, rol, texto, ts, traza_json) VALUES (?,?,?,?,?)")
      .bind(wa, "agente", `[Plataforma] ${aviso}`, ahora(), JSON.stringify([{ nodo: "plataforma", detalle, ok }])).run();
  }
  return enviado;
}

async function accionDespacho(env, { id, accion, usuario, motivo, transportista, referencia }) {
  const pedido = await uno(env, "SELECT * FROM pedidos WHERE id=?", id);
  const d = await uno(env, "SELECT * FROM despachos WHERE pedido_id=?", id);
  if (!pedido || pedido.estado !== "APROBADO") return fallo("No se encontró un pedido aceptado con ese número.", 404);
  if (!d) return fallo("El cliente todavía no entregó los datos de despacho.", 409);
  const quien = limpio(usuario, 60) || "plataforma";
  const cuando = ahora();
  const wa = pedido.wa_id;
  const lugar = `${d.direccion}, ${d.ciudad}`;
  let aviso, estadoNuevo;

  if (accion === "validar") {
    if (d.estado !== "POR_VALIDAR") return fallo(`Los datos están en estado ${d.estado.toLowerCase()}; solo se validan los que están por validar.`, 409);
    const carrier = limpio(transportista, 80);
    if (carrier.length < 3) return fallo("Indique el transportista para validar.", 400);
    const cliente = await buscarCliente(env, pedido.cliente_id);
    if (d.metodo_pago === "credito" && pedido.total > cliente.credito_disponible + 1e-6) return fallo("El cliente ya no tiene crédito suficiente para este pedido. Devuélvalo para que elija otro método de pago.", 409);
    await env.ERP.batch([
      env.ERP.prepare("UPDATE despachos SET estado='VALIDADO', transportista=?, referencia_pago=?, validado_por=?, motivo_devolucion=NULL, actualizado=? WHERE pedido_id=? AND estado='POR_VALIDAR'")
        .bind(carrier, limpio(referencia, 80) || null, quien, cuando, id),
      env.ERP.prepare("INSERT INTO auditoria (timestamp, usuario, accion, payload_json, resultado) VALUES (?,?,?,?,?)")
        .bind(cuando, quien, "DESPACHO_VALIDADO", JSON.stringify({ pedido_id: id, transportista: carrier, metodo_pago: d.metodo_pago }), "Datos revisados por un asesor"),
    ]);
    estadoNuevo = "VALIDADO";
    aviso = `✅ Validamos los datos de entrega de su pedido ${id}.\nEntrega: ${d.fecha_entrega} en ${lugar}. Recibe: ${d.contacto_nombre}.\nTransporte: ${carrier}. Pago: ${METODOS_PAGO[d.metodo_pago]}.\nLe avisamos cuando salga el despacho.`;
  } else if (accion === "devolver") {
    if (!["POR_VALIDAR", "VALIDADO"].includes(d.estado)) return fallo("Solo se devuelven datos que están por validar o validados.", 409);
    const razon = limpio(motivo, 300);
    if (razon.length < 3) return fallo("Escriba qué debe corregir el cliente.", 400);
    await env.ERP.batch([
      env.ERP.prepare("UPDATE despachos SET estado='DEVUELTO', motivo_devolucion=?, validado_por=NULL, actualizado=? WHERE pedido_id=? AND estado IN ('POR_VALIDAR','VALIDADO')").bind(razon, cuando, id),
      env.ERP.prepare("INSERT INTO auditoria (timestamp, usuario, accion, payload_json, resultado) VALUES (?,?,?,?,?)")
        .bind(cuando, quien, "DESPACHO_DEVUELTO", JSON.stringify({ pedido_id: id, motivo: razon }), "El cliente debe corregir"),
    ]);
    estadoNuevo = "DEVUELTO";
    aviso = `Para despachar su pedido ${id} necesitamos corregir un dato: ${razon}\nResponda por aquí con el dato correcto y lo revisamos de nuevo.`;
  } else {
    if (d.estado !== "VALIDADO") return fallo("Solo se despacha un pedido con datos validados.", 409);
    const lineas = await todos(env, "SELECT * FROM pedido_detalle WHERE pedido_id=?", id);
    const sentencias = [
      env.ERP.prepare("INSERT INTO despachos_salidas (pedido_id) VALUES (?)").bind(id),
      env.ERP.prepare("UPDATE despachos SET estado='DESPACHADO', actualizado=? WHERE pedido_id=? AND estado='VALIDADO'").bind(cuando, id),
    ];
    for (const l of lineas) {
      sentencias.push(
        env.ERP.prepare("UPDATE inventario SET stock_reservado = stock_reservado - ? WHERE sku=? AND bodega=?").bind(l.cantidad, l.sku, l.bodega),
        env.ERP.prepare("INSERT INTO movimientos (ts, sku, bodega, tipo, cantidad, pedido_id, disponible_antes, disponible_despues, reservado_despues) SELECT ?1, sku, bodega, 'SALIDA_DESPACHO', ?2, ?3, stock_disponible, stock_disponible, stock_reservado FROM inventario WHERE sku=?4 AND bodega=?5")
          .bind(cuando, l.cantidad, id, l.sku, l.bodega),
      );
    }
    if (d.metodo_pago === "credito") sentencias.push(env.ERP.prepare("UPDATE clientes SET saldo_pendiente = saldo_pendiente + ? WHERE id=?").bind(pedido.total, pedido.cliente_id));
    sentencias.push(env.ERP.prepare("INSERT INTO auditoria (timestamp, usuario, accion, payload_json, resultado) VALUES (?,?,?,?,?)")
      .bind(cuando, quien, "PEDIDO_DESPACHADO", JSON.stringify({ pedido_id: id, total: pedido.total, metodo_pago: d.metodo_pago }), d.metodo_pago === "credito" ? "Sale la flor reservada y el total pasa al saldo del cliente" : "Sale la flor reservada"));
    try {
      await env.ERP.batch(sentencias);
    } catch (e) {
      if (/UNIQUE|PRIMARY/i.test(String(e))) return fallo("Este pedido ya fue despachado.", 409);
      throw e;
    }
    estadoNuevo = "DESPACHADO";
    aviso = `🚚 Su pedido ${id} salió hoy hacia ${lugar}. Entrega prevista: ${d.fecha_entrega}. Transporte: ${d.transportista}.\n¡Gracias por su compra!`;
  }
  const enviado = await avisarCliente(env, wa, aviso, `Despacho ${estadoNuevo.toLowerCase()} por ${quien}`, accion !== "devolver");
  const movimientos = accion === "despachar" ? await todos(env, "SELECT sku, bodega, cantidad, disponible_despues, reservado_despues FROM movimientos WHERE pedido_id=? AND tipo='SALIDA_DESPACHO' ORDER BY id", id) : [];
  return json({ ok: true, estado: estadoNuevo, movimientos, notificado: enviado.ok, motivo_no_notificado: enviado.ok ? null : enviado.motivo });
}

async function listarDespachos(env, limite) {
  const filas = await todos(env,
    "SELECT p.id AS pedido_id, p.total, p.destino, p.wa_id, p.cliente_id, c.razon_social, c.credito_disponible_calc, d.estado AS d_estado, d.contacto_nombre, d.contacto_telefono, d.direccion, d.ciudad, d.fecha_entrega, d.metodo_pago, d.transportista, d.referencia_pago, d.motivo_devolucion, d.actualizado FROM pedidos p JOIN (SELECT id, razon_social, limite_credito - saldo_pendiente AS credito_disponible_calc FROM clientes) c ON c.id=p.cliente_id LEFT JOIN despachos d ON d.pedido_id=p.id WHERE p.estado='APROBADO' ORDER BY (COALESCE(d.estado,'')='DESPACHADO'), p.id DESC LIMIT ?", limite);
  return filas.map((f) => ({ ...f, estado: f.d_estado || "FALTAN_DATOS", metodo_pago_texto: METODOS_PAGO[f.metodo_pago] || null }));
}

// ---------- puerta de la plataforma: /api/plataforma/* ----------

async function decidirPedido(env, { id, accion, usuario, motivo }) {
  const pedido = await uno(env, "SELECT * FROM pedidos WHERE id=?", id);
  if (!pedido) return fallo("No se encontró el pedido.", 404);
  if (pedido.estado !== "PENDIENTE") return fallo(`Este pedido ya está ${pedido.estado.toLowerCase()}.`, 409);
  const lineas = await todos(env, "SELECT d.*, p.nombre FROM pedido_detalle d JOIN productos p ON p.sku = d.sku WHERE d.pedido_id=?", id);
  const quien = texto(usuario, 60) || "plataforma";
  const cuando = ahora();

  let aviso;
  let movimientos = [];
  if (accion === "rechazar") {
    try {
      await env.ERP.batch([
        env.ERP.prepare("INSERT INTO pedidos_decididos (pedido_id) VALUES (?)").bind(id),
        env.ERP.prepare("UPDATE pedidos SET estado='RECHAZADO', aprobado_por=?, decidido_en=?, motivo=? WHERE id=? AND estado='PENDIENTE'").bind(quien, cuando, texto(motivo, 300) || null, id),
        env.ERP.prepare("INSERT INTO auditoria (timestamp, usuario, accion, payload_json, resultado) VALUES (?,?,?,?,?)").bind(cuando, quien, "PEDIDO_RECHAZADO", JSON.stringify({ pedido_id: id, motivo: texto(motivo, 300) }), "No se mueve stock"),
      ]);
    } catch (e) {
      if (/UNIQUE|PRIMARY/i.test(String(e))) return fallo("Este pedido ya fue decidido.", 409);
      throw e;
    }
    aviso = `Gracias por su pedido ${id}. Por ahora no lo podemos atender tal como está; un asesor comercial se comunicará con usted para ofrecerle alternativas.${motivo ? `\nMotivo: ${texto(motivo, 200)}` : ""}`;
  } else {
    // Todo o nada: si alguna finca no tiene stock, el CHECK de la tabla falla y no se mueve nada.
    const sentencias = [
      env.ERP.prepare("INSERT INTO pedidos_decididos (pedido_id) VALUES (?)").bind(id),
      env.ERP.prepare("UPDATE pedidos SET estado='APROBADO', aprobado_por=?, decidido_en=? WHERE id=? AND estado='PENDIENTE'").bind(quien, cuando, id),
    ];
    for (const l of lineas) {
      sentencias.push(
        env.ERP.prepare("UPDATE inventario SET stock_disponible = stock_disponible - ?1, stock_reservado = stock_reservado + ?1 WHERE sku=?2 AND bodega=?3").bind(l.cantidad, l.sku, l.bodega),
        env.ERP.prepare("INSERT INTO movimientos (ts, sku, bodega, tipo, cantidad, pedido_id, disponible_antes, disponible_despues, reservado_despues) SELECT ?1, sku, bodega, 'RESERVA_PEDIDO', ?2, ?3, stock_disponible + ?2, stock_disponible, stock_reservado FROM inventario WHERE sku=?4 AND bodega=?5")
          .bind(cuando, l.cantidad, id, l.sku, l.bodega),
      );
    }
    sentencias.push(env.ERP.prepare("INSERT INTO auditoria (timestamp, usuario, accion, payload_json, resultado) VALUES (?,?,?,?,?)")
      .bind(cuando, quien, "PEDIDO_APROBADO", JSON.stringify({ pedido_id: id, total: pedido.total }), `Stock reservado en ${[...new Set(lineas.map((l) => l.bodega))].join(", ")}`));
    try {
      await env.ERP.batch(sentencias);
    } catch (e) {
      const m = String(e);
      if (/CHECK/i.test(m)) return fallo("No alcanza el stock en alguna finca. No se movió nada: puede rechazar el pedido.", 409);
      if (/UNIQUE|PRIMARY/i.test(m)) return fallo("Este pedido ya fue decidido.", 409);
      throw e;
    }
    movimientos = await todos(env, "SELECT sku, bodega, cantidad, disponible_antes, disponible_despues, reservado_despues FROM movimientos WHERE pedido_id=? ORDER BY id", id);
    aviso = `✅ ¡Su pedido ${id} fue aprobado!\n${lineasParaCliente(lineas)}\nTotal: ${dinero(pedido.total)}\nLa flor quedó reservada en ${[...new Set(lineas.map((l) => l.bodega))].join(", ")}. Para programar el despacho envíeme por aquí: ${DATOS_DESPACHO}.`;
  }

  const enviado = await enviarWhatsapp(env, pedido.wa_id, aviso);
  if (pedido.wa_id) {
    await env.ERP.prepare("INSERT INTO mensajes (wa_id, rol, texto, ts, traza_json) VALUES (?,?,?,?,?)")
      .bind(pedido.wa_id, "agente", `[Plataforma] ${aviso}`, ahora(), JSON.stringify([{ nodo: "plataforma", detalle: `${accion === "rechazar" ? "Rechazado" : "Aprobado"} por ${quien}`, ok: accion !== "rechazar" }])).run();
  }
  return json({ ok: true, estado: accion === "rechazar" ? "RECHAZADO" : "APROBADO", movimientos, notificado: enviado.ok, motivo_no_notificado: enviado.ok ? null : enviado.motivo });
}

async function plataforma(request, env, url) {
  if (!env.ERP) return fallo("El ERP no está configurado.", 503);
  const ruta = url.pathname.replace(/^\/api\/plataforma/, "");
  const metodo = request.method;

  if (ruta === "/entrar" && metodo === "POST") {
    if (!mismoOrigen(request)) return fallo("Origen no permitido.", 403);
    if (!configurado(env)) return fallo("El acceso no está configurado todavía.", 503);
    const ip = request.headers.get("cf-connecting-ip") || "local";
    if (env.LIMITE_ENTRAR && !(await env.LIMITE_ENTRAR.limit({ key: ip })).success) return fallo("Demasiados intentos. Espere un minuto.", 429);
    const { d, error } = await cuerpoJson(request);
    if (error) return error;
    if (typeof d.clave !== "string" || d.clave.length > 200 || !(await claveCorrecta(env, d.clave))) return fallo("Contraseña incorrecta.", 401);
    const r = json({ ok: true });
    r.headers.set("set-cookie", await crearCookie(env));
    return r;
  }
  if (ruta === "/salir" && metodo === "POST") {
    const r = json({ ok: true });
    r.headers.set("set-cookie", cookieVencida());
    return r;
  }
  if (!(await sesionValida(request, env))) return fallo("Inicie sesión para continuar.", 401);

  const limite = Math.min(Math.max(Number(url.searchParams.get("limite")) || 50, 1), 200);

  if (ruta === "/resumen" && metodo === "GET") {
    const k = await uno(env, "SELECT COUNT(*) AS productos, COUNT(DISTINCT substr(nombre, 1, length(nombre) - 6)) AS variedades FROM productos");
    const s = await uno(env, "SELECT COALESCE(SUM(stock_disponible),0) AS disponible, COALESCE(SUM(stock_reservado),0) AS reservado FROM inventario");
    const p = await todos(env, "SELECT estado, COUNT(*) AS n FROM pedidos GROUP BY estado");
    const c = await uno(env, "SELECT COUNT(*) AS n FROM clientes");
    const pv = await uno(env, "SELECT COUNT(*) AS n FROM despachos WHERE estado='POR_VALIDAR'");
    return json({ ok: true, ...k, ...s, clientes: c.n, por_validar: pv.n, pedidos: Object.fromEntries(p.map((x) => [x.estado, x.n])) });
  }
  if (ruta === "/pedidos" && metodo === "GET") {
    const estado = url.searchParams.get("estado");
    const pedidos = estado === "PENDIENTE"
      ? await todos(env, "SELECT p.*, c.razon_social, c.segmento, c.pais, c.whatsapp AS cliente_whatsapp FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE p.estado='PENDIENTE' ORDER BY p.fecha DESC LIMIT ?", limite)
      : await todos(env, "SELECT p.*, c.razon_social, c.segmento, c.pais, c.whatsapp AS cliente_whatsapp FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE p.estado<>'PENDIENTE' ORDER BY p.fecha DESC, p.id DESC LIMIT ?", limite);
    const ids = pedidos.map((p) => p.id);
    const lineas = ids.length
      ? await todos(env, `SELECT d.*, pr.nombre FROM pedido_detalle d JOIN productos pr ON pr.sku=d.sku WHERE d.pedido_id IN (${ids.map(() => "?").join(",")}) ORDER BY d.pedido_id`, ...ids)
      : [];
    return json({ ok: true, pedidos: pedidos.map((p) => ({ ...p, lineas: lineas.filter((l) => l.pedido_id === p.id) })) });
  }
  if (ruta === "/pedidos/decidir" && metodo === "POST") {
    if (!mismoOrigen(request)) return fallo("Origen no permitido.", 403);
    const { d, error } = await cuerpoJson(request);
    if (error) return error;
    if (!/^PED-\d{4,}$/.test(String(d.id)) || !["aprobar", "rechazar"].includes(d.accion)) return fallo("Datos no válidos.", 400);
    return decidirPedido(env, { id: d.id, accion: d.accion, usuario: d.usuario, motivo: d.motivo });
  }
  if (ruta === "/despachos" && metodo === "GET") {
    return json({ ok: true, despachos: await listarDespachos(env, limite) });
  }
  if (ruta === "/despachos/accion" && metodo === "POST") {
    if (!mismoOrigen(request)) return fallo("Origen no permitido.", 403);
    const { d, error } = await cuerpoJson(request);
    if (error) return error;
    if (!/^PED-\d{4,}$/.test(String(d.id)) || !["validar", "devolver", "despachar"].includes(d.accion)) return fallo("Datos no válidos.", 400);
    return accionDespacho(env, { id: d.id, accion: d.accion, usuario: d.usuario, motivo: d.motivo, transportista: d.transportista, referencia: d.referencia });
  }
  if (ruta === "/inventario" && metodo === "GET") {
    const q = texto(url.searchParams.get("q"), 40).replace(/[%_\\]/g, "").trim();
    const patron = `%${q}%`;
    const filas = await todos(env,
      "SELECT p.sku, p.nombre, p.precio_unitario, i.bodega, i.stock_disponible, i.stock_reservado FROM productos p JOIN inventario i ON i.sku=p.sku WHERE (?1 = '' OR p.nombre LIKE ?2 OR p.sku LIKE ?2) ORDER BY p.sku, i.bodega LIMIT ?3",
      q, patron, limite * 3);
    const porSku = new Map();
    for (const f of filas) {
      if (!porSku.has(f.sku)) porSku.set(f.sku, { sku: f.sku, nombre: f.nombre, precio_unitario: f.precio_unitario, fincas: {} });
      porSku.get(f.sku).fincas[f.bodega] = { disponible: f.stock_disponible, reservado: f.stock_reservado };
    }
    return json({ ok: true, productos: [...porSku.values()].slice(0, limite) });
  }
  if (ruta === "/movimientos" && metodo === "GET") {
    return json({ ok: true, movimientos: await todos(env, "SELECT m.*, p.nombre FROM movimientos m LEFT JOIN productos p ON p.sku=m.sku ORDER BY m.id DESC LIMIT ?", limite) });
  }
  if (ruta === "/clientes" && metodo === "GET") {
    return json({ ok: true, clientes: await todos(env, "SELECT id, razon_social, pais, whatsapp, limite_credito, saldo_pendiente, segmento, descuento_max FROM clientes ORDER BY id") });
  }
  if (ruta === "/auditoria" && metodo === "GET") {
    return json({ ok: true, auditoria: await todos(env, "SELECT id, timestamp, usuario, accion, resultado FROM auditoria ORDER BY id DESC LIMIT ?", limite) });
  }
  if (ruta === "/conversaciones" && metodo === "GET") {
    const grupos = await todos(env, "SELECT wa_id, MAX(id) AS ultimo_id, COUNT(*) AS n FROM mensajes GROUP BY wa_id ORDER BY ultimo_id DESC LIMIT ?", limite);
    const clientes = await todos(env, "SELECT razon_social, whatsapp FROM clientes");
    const ult = grupos.length ? await todos(env, `SELECT id, texto, ts, rol FROM mensajes WHERE id IN (${grupos.map(() => "?").join(",")})`, ...grupos.map((g) => g.ultimo_id)) : [];
    return json({
      ok: true,
      conversaciones: grupos.map((g) => {
        const m = ult.find((x) => x.id === g.ultimo_id) || {};
        return { wa_id: g.wa_id, mensajes: g.n, ultimo: m.texto || "", ts: m.ts || "", cliente: clientes.find((c) => digitos(c.whatsapp) === g.wa_id)?.razon_social || null };
      }),
    });
  }
  if (ruta === "/conversacion" && metodo === "GET") {
    const wa = digitos(url.searchParams.get("wa"));
    if (wa.length < 8) return fallo("Número no válido.", 400);
    const filas = await todos(env, "SELECT rol, texto, ts, traza_json FROM mensajes WHERE wa_id=? ORDER BY id DESC LIMIT 200", wa);
    return json({ ok: true, mensajes: filas.reverse().map((m) => ({ rol: m.rol, texto: m.texto, ts: m.ts, traza: m.traza_json ? JSON.parse(m.traza_json) : [] })) });
  }
  return fallo("No encontrado.", 404);
}

// ---------- entrada desde el Worker ----------

export async function atenderErp(request, env, url) {
  if (url.pathname.startsWith("/api/erp/")) return erpAgente(request, env, url);
  if (url.pathname.startsWith("/api/plataforma/")) return plataforma(request, env, url);
  return null;
}

// Las páginas de la plataforma: solo el acceso es público; el resto exige sesión.
const PUBLICAS = new Set(["/plataforma/entrar", "/plataforma/entrar.html", "/plataforma/entrar.js", "/plataforma/plataforma.css"]);

export async function servirPlataforma(request, env, url) {
  if (!PUBLICAS.has(url.pathname) && !(await sesionValida(request, env))) {
    if (url.pathname.endsWith(".js")) return fallo("Inicie sesión para continuar.", 401);
    return Response.redirect(new URL("/plataforma/entrar", url).toString(), 302);
  }
  const r = await env.ASSETS.fetch(request);
  const h = new Headers(r.headers);
  h.set("cache-control", "private, no-store");
  h.set("x-robots-tag", "noindex, nofollow");
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}
