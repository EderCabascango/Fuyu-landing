// Formulario de datos de entrega del cliente. Se abre con el enlace que llega por WhatsApp (pedido y firma en la
// dirección). El servidor valida todo otra vez: esto solo ayuda a llenar bien. Todo texto del servidor se pone
// con textContent, nunca como HTML.

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const P = params.get("p") || "";
const T = params.get("t") || "";
const dinero = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function linea(texto, valor, clase) {
  const d = document.createElement("div");
  d.className = `resumen-linea ${clase || ""}`;
  const a = document.createElement("span"); a.textContent = texto;
  const b = document.createElement("span"); b.textContent = valor;
  d.append(a, b);
  return d;
}

function estado(texto) { $("#estado").textContent = texto; }

async function cargar() {
  if (!P || !T) return estado("Este enlace no es válido. Pídale al asistente por WhatsApp uno nuevo.");
  let r, j;
  try {
    r = await fetch(`/api/despacho/info?p=${encodeURIComponent(P)}&t=${encodeURIComponent(T)}`);
    j = await r.json();
  } catch {
    return estado("No pudimos cargar el formulario. Revise su conexión e intente de nuevo.");
  }
  if (!r.ok || !j.ok) return estado(j.error || "Este enlace no es válido o venció. Pídale al asistente por WhatsApp uno nuevo.");

  const res = $("#resumen");
  res.replaceChildren();
  for (const l of j.pedido.lineas) res.append(linea(`${l.cantidad} tallos · ${l.nombre}`, dinero(l.subtotal)));
  res.append(linea(`Pedido ${j.pedido.id}`, dinero(j.pedido.total), "resumen-total"));
  res.hidden = false;

  const d = j.despacho;
  if (!j.editable) {
    return estado(d?.estado === "DESPACHADO"
      ? "Este pedido ya fue despachado. ¡Gracias por su compra!"
      : "Ya validamos los datos de entrega de este pedido. Si necesita cambiar algo, escríbanos por WhatsApp.");
  }
  if (d?.estado === "DEVUELTO" && d.motivo_devolucion) {
    const aviso = $("#devuelto");
    aviso.textContent = `Un asesor necesita que corrija un dato: ${d.motivo_devolucion}`;
    aviso.hidden = false;
  }
  estado(d?.estado === "POR_VALIDAR" ? "Ya recibimos sus datos. Puede corregirlos y volver a enviarlos mientras un asesor los revisa." : "Complete los datos para programar la entrega.");

  const f = $("#form");
  const metodo = $("#metodo_pago");
  metodo.replaceChildren();
  const vacio = new Option("Elija una opción", "");
  vacio.disabled = true; vacio.selected = true;
  metodo.append(vacio);
  for (const [clave, nombre] of Object.entries(j.metodos_pago)) metodo.append(new Option(nombre, clave));
  const fecha = $("#fecha_entrega");
  fecha.min = j.fecha_minima; fecha.max = j.fecha_maxima;
  if (d) for (const k of ["contacto_nombre", "contacto_telefono", "direccion", "ciudad", "fecha_entrega", "metodo_pago"]) if (d[k]) f.elements[k].value = d[k];
  if (!d?.ciudad && j.pedido.destino) $("#ciudad").value = j.pedido.destino;
  f.hidden = false;
}

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#error");
  err.textContent = "";
  const f = e.target;
  const faltan = [...f.elements].filter((x) => x.name && !String(x.value).trim());
  if (faltan.length) { err.textContent = "Complete todos los campos."; faltan[0].focus(); return; }
  const boton = $("#enviar");
  boton.disabled = true;
  const cuerpo = { p: P, t: T };
  for (const x of f.elements) if (x.name) cuerpo[x.name] = x.value;
  try {
    const r = await fetch("/api/despacho/enviar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) { err.textContent = j.error || "No se pudo enviar. Intente de nuevo."; boton.disabled = false; return; }
  } catch {
    err.textContent = "No se pudo enviar. Revise su conexión e intente de nuevo.";
    boton.disabled = false;
    return;
  }
  f.hidden = true;
  $("#devuelto").hidden = true;
  estado("✓ ¡Listo! Recibimos sus datos de entrega. Un asesor los revisa y le confirmamos por WhatsApp. Ya puede cerrar esta página.");
});

cargar();
