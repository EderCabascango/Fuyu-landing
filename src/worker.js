// Worker de Fuyu: sirve el sitio (carpeta public/) y el endpoint POST /api/procesar,
// que lee un pedido o una factura con Groq y devuelve los datos ordenados.
// No se guarda ningún documento: el texto o la imagen solo pasa hacia Groq y la respuesta vuelve al navegador.

const MAX_IMAGENES = 3;
const MAX_CARACTERES = 30000;

// ---------- Esquemas de respuesta (salida estructurada estricta) ----------

const num = { type: ["number", "null"] };
const txt = { type: ["string", "null"] };

function objeto(props) {
  return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false };
}

const ESQUEMA_PEDIDO = objeto({
  cliente: txt,
  numero_pedido: txt,
  fecha_entrega: { ...txt, description: "Formato AAAA-MM-DD" },
  mercado: { ...txt, description: "Solo el país de destino, en español" },
  lineas: {
    type: "array",
    items: objeto({
      variedad: { ...txt, description: "Tal como está escrita en el pedido, sin corregir" },
      largo_cm: num,
      cajas: num,
      tipo_caja: { ...txt, description: "HB, QB, FB u otro, tal como viene" },
      bonches_por_caja: num,
      tallos_por_bonche: num,
      total_tallos_declarado: { ...num, description: "Solo si el pedido escribe un total de tallos para la línea" },
      precio_tallo: { ...num, description: "Precio por tallo en USD, si viene" },
      notas: txt,
    }),
  },
  observaciones: txt,
});

const ESQUEMA_FACTURA = objeto({
  proveedor: txt,
  ruc: { ...txt, description: "Solo los dígitos, tal como aparecen" },
  numero_factura: txt,
  fecha: { ...txt, description: "Formato AAAA-MM-DD" },
  items: {
    type: "array",
    items: objeto({
      descripcion: txt,
      cantidad: num,
      precio_unitario: num,
      subtotal_linea: num,
    }),
  },
  subtotal: num,
  iva: { ...num, description: "Valor del IVA en dólares" },
  tarifa_iva: { ...num, description: "Porcentaje de IVA, por ejemplo 15" },
  total: num,
});

function instrucciones(modo, hoy) {
  const comunes =
    `Hoy es ${hoy}. Extrae los datos exactamente como aparecen en el documento. ` +
    "No inventes nada: si un dato no está, usa null. No corrijas errores ni recalcules totales: " +
    "copia los números que están escritos, aunque no cuadren. Las fechas van en formato AAAA-MM-DD; " +
    "si falta el año, usa el próximo año en que caiga esa fecha a partir de hoy.";
  if (modo === "pedido") {
    return (
      "Lees pedidos que importadores de flores envían a una finca de rosas en Ecuador " +
      "(por correo, WhatsApp, PDF o Excel; en español, inglés u otro idioma). " +
      comunes +
      " Cada combinación de variedad y largo es una línea. Copia el nombre de la variedad tal cual está escrito. " +
      "El largo va en centímetros como número (\"60cm\" → 60). " +
      "\"HB\" es half box, \"QB\" quarter box, \"FB\" full box. " +
      "En total_tallos_declarado pon solo el total de tallos que el pedido escribe para esa línea; si no lo escribe, null. " +
      "El cliente es la empresa que compra (por ejemplo \"Bloomfield Wholesale Inc.\"), no la persona que escribe; " +
      "usa el nombre de la persona solo si no aparece ninguna empresa. " +
      "El mercado es solo el país de destino, escrito en español (por ejemplo \"Estados Unidos\", \"Países Bajos\", \"Rusia\"), sin la ciudad."
    );
  }
  return (
    "Lees facturas de proveedores de una finca de rosas en Ecuador (insumos, cartón, transporte, servicios). " +
    comunes +
    " El RUC va solo con dígitos. Los valores son en dólares. " +
    "subtotal es la base antes de IVA; iva es el valor en dólares del impuesto; total es el valor a pagar."
  );
}

// ---------- Utilidades ----------

function respuesta(datos, estado = 200, extra = {}) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

function error(mensaje, estado) {
  return respuesta({ ok: false, error: mensaje }, estado);
}

function hoyEcuador() {
  // Ecuador continental: UTC-5, sin horario de verano
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function extraerJSON(contenido) {
  if (!contenido) return null;
  const limpio = contenido.replace(/<think>[\s\S]*?<\/think>/g, "");
  const ini = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  try {
    return JSON.parse(limpio.slice(ini, fin + 1));
  } catch {
    return null;
  }
}

async function llamarGroq(env, { modo, texto, imagenes }) {
  const conImagen = imagenes.length > 0;
  const modelo = conImagen ? env.GROQ_MODELO_VISION : env.GROQ_MODELO_TEXTO;
  const esquema = modo === "pedido" ? ESQUEMA_PEDIDO : ESQUEMA_FACTURA;

  const contenidoUsuario = conImagen
    ? [
        { type: "text", text: texto ? `Texto adicional:\n${texto}` : "Lee el documento de la imagen." },
        ...imagenes.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : `Documento:\n\n${texto}`;

  const cuerpo = {
    model: modelo,
    temperature: 0,
    messages: [
      { role: "system", content: instrucciones(modo, hoyEcuador()) },
      { role: "user", content: contenidoUsuario },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: modo, strict: true, schema: esquema },
    },
  };
  if (modelo.startsWith("openai/gpt-oss")) cuerpo.reasoning_effort = "low";

  const base = (env.GROQ_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
  let ultimoEstado = 0;
  for (let intento = 0; intento < 2; intento++) {
    let r;
    try {
      r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
    } catch (e) {
      console.log("No se pudo conectar con Groq:", String(e).slice(0, 200));
      return { estado: 502 };
    }
    ultimoEstado = r.status;
    if (r.ok) {
      const j = await r.json();
      const datos = extraerJSON(j?.choices?.[0]?.message?.content);
      if (datos) return { datos, modelo };
      continue; // respuesta ilegible: un reintento
    }
    if (r.status === 429) return { estado: 429 };
    // 400 por salida que no cumple el formato: vale la pena un reintento
    const detalle = await r.text();
    console.log("Groq respondió", r.status, detalle.slice(0, 300));
    if (r.status !== 400) break;
  }
  return { estado: ultimoEstado || 502 };
}

// ---------- Endpoint ----------

async function procesar(request, env) {
  if (request.method !== "POST") return error("Método no permitido.", 405);

  // Solo desde este mismo sitio
  const origen = request.headers.get("origin");
  if (origen && new URL(origen).host !== new URL(request.url).host) {
    return error("Origen no permitido.", 403);
  }

  if (!env.GROQ_API_KEY) {
    return error("La demo no está configurada todavía (falta la clave del servicio).", 503);
  }

  const maxBytes = Number(env.TAMANO_MAXIMO_BYTES || 2097152);
  const declarado = Number(request.headers.get("content-length") || 0);
  if (declarado > maxBytes) return error("El documento es demasiado grande. El máximo es 2 MB.", 413);

  const bruto = await request.arrayBuffer();
  if (bruto.byteLength > maxBytes) return error("El documento es demasiado grande. El máximo es 2 MB.", 413);

  let entrada;
  try {
    entrada = JSON.parse(new TextDecoder().decode(bruto));
  } catch {
    return error("No se pudo leer lo enviado.", 400);
  }

  const modo = entrada?.modo;
  if (modo !== "pedido" && modo !== "factura") return error("Tipo de documento no válido.", 400);

  const texto = typeof entrada.texto === "string" ? entrada.texto.trim().slice(0, MAX_CARACTERES) : "";
  const imagenes = Array.isArray(entrada.imagenes)
    ? entrada.imagenes.filter((u) => typeof u === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(u))
    : [];
  if (imagenes.length > MAX_IMAGENES) return error(`Máximo ${MAX_IMAGENES} páginas o fotos por documento.`, 400);
  if (!texto && imagenes.length === 0) return error("No llegó ningún contenido para leer.", 400);

  // Límite de uso por IP (5 documentos por minuto, configurado en wrangler.jsonc)
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const { success } = await env.LIMITADOR.limit({ key: ip });
  if (!success) {
    return respuesta(
      { ok: false, error: "Llegó al límite de documentos por minuto en la demo. Espere un minuto e intente de nuevo." },
      429,
      { "retry-after": "60" }
    );
  }

  const resultado = await llamarGroq(env, { modo, texto, imagenes });
  if (resultado.estado === 429) {
    return error("La demo está muy solicitada en este momento. Intente de nuevo en un minuto.", 503);
  }
  if (!resultado.datos) {
    return error("No pudimos leer el documento. Intente de nuevo o use uno de los ejemplos.", 502);
  }
  return respuesta({ ok: true, modo, datos: resultado.datos, lectura: imagenes.length ? "imagen" : "texto" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/procesar") return procesar(request, env);
    if (url.pathname.startsWith("/api/")) return error("No encontrado.", 404);
    return env.ASSETS.fetch(request);
  },
};
