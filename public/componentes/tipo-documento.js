// Revisión rápida (sin gastar tokens) de si un texto parece un pedido de flores o una factura.
// La usan el navegador (antes de enviar) y el servidor (antes de llamar a Groq).

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Cada grupo cuenta una sola vez aunque aparezca muchas veces
const SENALES_PEDIDO = [
  /\bcajas?\b|\bboxe?s?\b/,
  /\bhb\b|\bqb\b|\bfb\b|\bhalf box\b|\bquarter box\b/,
  /\btallos?\b|\bstems?\b/,
  /\bbonch(e|es)\b|\bbunch(es)?\b|\bramos?\b/,
  /\bpedido\b|\border\b|\bp\.?o\.?\b|\bpurchase\b|\bzakaz\b/,
  /\brosas?\b|\broses?\b|\bflores\b|\bflowers?\b/,
  /\bvariedad(es)?\b|\bvariet(y|ies)\b/,
  /\b\d{2}\s?cm\b|\blargo\b|\blength\b/,
  /\bfreedom\b|\bexplorer\b|\bvendela\b|\bmondial\b|\bplaya blanca\b|\bpink floyd\b|\bhearts?\b|\bcandlelight\b|\bnina\b|\bbrighton\b|\bpolar star\b|\bhigh magic\b/,
];

const SENALES_FACTURA = [
  /\bfactura\b|\binvoice\b|\bcomprobante\b/,
  /\br\.?\s?u\.?\s?c\.?\b/,
  /\biva\b|\bvat\b|\bimpuesto\b/,
  /\bsubtotal\b|\bsub total\b/,
  /\btotal\b/,
  /\bautorizacion\b|\bsri\b/,
  /\bp\.?\s?unitario\b|\bprecio unitario\b|\bv\.?\s?unit\b|\bunit price\b/,
  /\bcantidad\b|\bcant\.?\b|\bqty\b/,
  /\bemision\b|\bfecha de emision\b|\bforma de pago\b/,
];

export function contarSenales(texto) {
  const t = normalizar(texto);
  const pedido = SENALES_PEDIDO.filter((re) => re.test(t)).length;
  const factura = SENALES_FACTURA.filter((re) => re.test(t)).length;
  // Una factura de verdad casi siempre dice "factura" o trae RUC e IVA
  const fuerteFactura = SENALES_FACTURA[0].test(t) || (SENALES_FACTURA[1].test(t) && SENALES_FACTURA[2].test(t));
  return { pedido, factura, fuerteFactura };
}

// Devuelve null si el texto parece del tipo elegido; si no, un mensaje y el tipo sugerido
export function revisarTipo(modo, texto) {
  const limpio = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (limpio.replace(/\s/g, "").length < 15) {
    return { mensaje: "El documento casi no tiene texto para leer. Pruebe con otro o use los ejemplos.", sugerido: null };
  }
  const s = contarSenales(limpio);
  if (modo === "factura") {
    if (s.fuerteFactura && s.factura >= 3) return null;
    if (s.pedido >= 3) return { mensaje: "Este documento parece un pedido, no una factura.", sugerido: "pedido" };
    return { mensaje: "Este documento no parece una factura de proveedor. Pruebe con una factura o use los ejemplos.", sugerido: null };
  }
  if (s.fuerteFactura && s.factura >= 4 && s.factura >= s.pedido + 2) {
    return { mensaje: "Este documento parece una factura, no un pedido.", sugerido: "factura" };
  }
  if (s.pedido >= 2) return null;
  return { mensaje: "Este documento no parece un pedido de flores. Pruebe con un pedido o use los ejemplos.", sugerido: null };
}
