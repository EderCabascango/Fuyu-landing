// Reglas fijas (sin IA) para revisar lo que se leyó del documento.
// Cada problema: { clave, nivel: "rojo" | "amarillo", campo, linea (índice o null), mensaje, arreglos }
// Cada arreglo es un botón: poner un valor, ver en el documento, escribirlo a mano, elegir de una lista o dejar así.

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const vacio = (v) => v === null || v === undefined || String(v).trim() === "";
const numero = (v) => (vacio(v) ? null : Number(String(v).replace(",", ".")));
export const dinero = (n) => `$${Number(n).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const miles = (n) => Number(n).toLocaleString("es-EC");
const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : String(xs[0]));

const VER = { texto: "Ver en el documento", tipo: "ver" };
const DEJAR = { texto: "Dejar así", tipo: "ignorar" };
const escribir = (texto, campo, linea = null) => ({ texto, tipo: "escribir", campo, linea });
const poner = (texto, campo, linea, valor) => ({ texto, tipo: "poner", campo, linea, valor });

function distancia(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function buscarVariedad(nombre, catalogo) {
  const n = normalizar(nombre);
  if (!n) return { exacta: null, parecida: null };
  const exacta = catalogo.variedades.find((v) => normalizar(v.nombre) === n);
  if (exacta) return { exacta, parecida: null };
  let mejor = null, mejorD = Infinity;
  for (const v of catalogo.variedades) {
    const d = distancia(n, normalizar(v.nombre));
    if (d < mejorD) { mejor = v; mejorD = d; }
  }
  return { exacta: null, parecida: mejorD <= 2 ? mejor : null };
}

function revisarFecha(valor, campo, etiqueta, problemas, { futura = false } = {}) {
  if (vacio(valor)) {
    problemas.push({ clave: `${campo}-falta`, nivel: "rojo", campo, linea: null, mensaje: `Falta la ${etiqueta}.`, arreglos: [escribir("Escribirla", campo), VER] });
    return;
  }
  const f = new Date(`${valor}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || isNaN(f)) {
    problemas.push({ clave: `${campo}-mal`, nivel: "rojo", campo, linea: null, mensaje: `No se entiende la ${etiqueta} (escríbala como AAAA-MM-DD).`, arreglos: [escribir("Corregirla", campo), VER] });
    return;
  }
  if (futura) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (f < hoy) problemas.push({ clave: `${campo}-pasada`, nivel: "amarillo", campo, linea: null, mensaje: `La ${etiqueta} ya pasó.`, arreglos: [escribir("Corregirla", campo), DEJAR] });
  }
}

// ---------------- Pedidos ----------------

export function totalTallosCalculado(l) {
  const c = numero(l.cajas), b = numero(l.bonches_por_caja), t = numero(l.tallos_por_bonche);
  return c !== null && b !== null && t !== null ? c * b * t : null;
}

export function validarPedido(p, catalogo) {
  const problemas = [];
  if (vacio(p.cliente)) problemas.push({ clave: "cliente-falta", nivel: "rojo", campo: "cliente", linea: null, mensaje: "Falta el cliente.", arreglos: [escribir("Escribirlo", "cliente"), VER] });
  revisarFecha(p.fecha_entrega, "fecha_entrega", "fecha de entrega", problemas, { futura: true });
  if (vacio(p.mercado)) problemas.push({ clave: "mercado-falta", nivel: "amarillo", campo: "mercado", linea: null, mensaje: "No dice a qué país va.", arreglos: [escribir("Escribirlo", "mercado"), DEJAR] });
  if (!p.lineas?.length) problemas.push({ clave: "sin-lineas", nivel: "rojo", campo: null, linea: null, mensaje: "No se encontraron líneas de flor en el pedido.", arreglos: [] });

  (p.lineas || []).forEach((l, i) => {
    const push = (nivel, campo, tipo, mensaje, arreglos) => problemas.push({ clave: `${i}-${tipo}`, nivel, campo, linea: i, mensaje, arreglos });
    const nombre = vacio(l.variedad) ? `Línea ${i + 1}` : l.variedad;

    // Variedad
    let variedad = null;
    if (vacio(l.variedad)) push("rojo", "variedad", "variedad-falta", `Línea ${i + 1}: falta la variedad.`, [escribir("Escribirla", "variedad", i), VER]);
    else {
      const { exacta, parecida } = buscarVariedad(l.variedad, catalogo);
      variedad = exacta || parecida;
      if (!exacta && parecida)
        push("amarillo", "variedad", "variedad-parecida", `Pidieron “${l.variedad}”. ¿Es ${parecida.nombre}?`, [poner(`Usar ${parecida.nombre}`, "variedad", i, parecida.nombre), DEJAR]);
      else if (!exacta)
        push("rojo", "variedad", "variedad-no-existe", `Pidieron ${l.variedad}, pero no está en el catálogo de la finca.`, [
          { texto: "Cambiar por…", tipo: "elegir", campo: "variedad", linea: i, opciones: catalogo.variedades.map((v) => v.nombre) },
          VER,
        ]);
    }

    // Largo
    const largo = numero(l.largo_cm);
    if (largo === null) push("rojo", "largo_cm", "largo-falta", `${nombre}: falta el largo.`, [escribir("Escribirlo", "largo_cm", i), VER]);
    else if (variedad && !variedad.largos.includes(largo)) {
      const cercanos = [...variedad.largos].sort((a, b) => Math.abs(a - largo) - Math.abs(b - largo) || a - b).slice(0, 2).sort((a, b) => a - b);
      push("rojo", "largo_cm", "largo-no-hay", `Pidieron ${variedad.nombre} ${largo}, pero en el catálogo hay ${lista(variedad.largos)}.`, [
        ...cercanos.map((c) => poner(`Usar ${c}`, "largo_cm", i, String(c))),
        DEJAR,
      ]);
    }

    // Cajas
    const cajas = numero(l.cajas);
    if (cajas === null) push("rojo", "cajas", "cajas-falta", `${nombre}: falta el número de cajas.`, [escribir("Escribirlo", "cajas", i), VER]);
    else if (!(cajas > 0) || !Number.isInteger(cajas)) push("rojo", "cajas", "cajas-mal", `${nombre}: el número de cajas no es válido.`, [escribir("Corregirlo", "cajas", i), VER]);

    // Empaque
    const tpb = numero(l.tallos_por_bonche);
    if (tpb === null) push("amarillo", "tallos_por_bonche", "tpb-falta", `${nombre}: no dice cuántos tallos lleva cada bonche.`, [poner("Usar 25", "tallos_por_bonche", i, "25"), VER]);
    else if (!catalogo.tallos_por_bonche_permitidos.includes(tpb))
      push("amarillo", "tallos_por_bonche", "tpb-raro", `${nombre}: bonches de ${tpb} tallos no son lo normal en la finca (${lista(catalogo.tallos_por_bonche_permitidos)}).`, [poner("Usar 25", "tallos_por_bonche", i, "25"), DEJAR]);
    if (numero(l.bonches_por_caja) === null) push("amarillo", "bonches_por_caja", "bxc-falta", `${nombre}: no dice cuántos bonches van por caja.`, [escribir("Escribirlo", "bonches_por_caja", i), VER]);

    // Cantidades que no cuadran
    const calculado = totalTallosCalculado(l);
    const declarado = numero(l.total_tallos_declarado);
    if (calculado !== null && declarado !== null && calculado !== declarado)
      push("rojo", "total_tallos_declarado", "suma", `${nombre}: ${cajas} cajas × ${numero(l.bonches_por_caja)} bonches × ${tpb} tallos dan ${miles(calculado)}, pero el pedido dice ${miles(declarado)}.`, [
        poner(`Usar ${miles(calculado)}`, "total_tallos_declarado", i, String(calculado)),
        VER,
      ]);

    // Precio
    const precio = numero(l.precio_tallo);
    if (precio === null) push("amarillo", "precio_tallo", "precio-falta", `${nombre}: no dice el precio.`, [escribir("Escribirlo", "precio_tallo", i), DEJAR]);
    else if (variedad && (precio < variedad.precio_min || precio > variedad.precio_max))
      push("amarillo", "precio_tallo", "precio-raro", `${nombre}: ${dinero(precio)} por tallo es raro para esta variedad (lo normal es ${dinero(variedad.precio_min)} a ${dinero(variedad.precio_max)}).`, [VER, DEJAR]);
  });
  return problemas;
}

// ---------------- Facturas ----------------

const difiere = (a, b) => Math.abs(a - b) > 0.011;
const redondo = (n) => (Math.round(n * 100) / 100).toFixed(2);

export function validarFactura(f) {
  const problemas = [];
  const push = (clave, nivel, campo, mensaje, arreglos, linea = null) => problemas.push({ clave, nivel, campo, linea, mensaje, arreglos });

  if (vacio(f.proveedor)) push("proveedor-falta", "rojo", "proveedor", "Falta el nombre del proveedor.", [escribir("Escribirlo", "proveedor"), VER]);

  const ruc = String(f.ruc ?? "").replace(/\D/g, "");
  if (vacio(f.ruc)) push("ruc-falta", "rojo", "ruc", "Falta el RUC del proveedor.", [escribir("Escribirlo", "ruc"), VER]);
  else if (ruc.length !== 13) push("ruc-largo", "rojo", "ruc", `El RUC debe tener 13 dígitos y este tiene ${ruc.length}.`, [escribir("Corregirlo", "ruc"), VER]);
  else if (!ruc.endsWith("001")) push("ruc-001", "amarillo", "ruc", "El RUC normalmente termina en 001. Revíselo.", [VER, DEJAR]);

  if (vacio(f.numero_factura)) push("numero-falta", "rojo", "numero_factura", "Falta el número de factura.", [escribir("Escribirlo", "numero_factura"), VER]);
  else if (!/^\d{3}-\d{3}-\d{9}$/.test(String(f.numero_factura).trim()))
    push("numero-forma", "amarillo", "numero_factura", "El número de factura no tiene la forma 001-001-000000123.", [VER, DEJAR]);

  revisarFecha(f.fecha, "fecha", "fecha de la factura", problemas);

  const items = f.items || [];
  if (!items.length) push("sin-items", "rojo", null, "No se encontraron ítems en la factura.", []);

  let suma = 0, sumaCompleta = true;
  items.forEach((it, i) => {
    const c = numero(it.cantidad), pu = numero(it.precio_unitario), st = numero(it.subtotal_linea);
    const nombre = vacio(it.descripcion) ? `Ítem ${i + 1}` : it.descripcion;
    if (vacio(it.descripcion)) push(`${i}-desc`, "amarillo", "descripcion", `Ítem ${i + 1}: falta la descripción.`, [escribir("Escribirla", "descripcion", i), DEJAR], i);
    if (st === null) { sumaCompleta = false; push(`${i}-valor-falta`, "rojo", "subtotal_linea", `${nombre}: falta el valor.`, [escribir("Escribirlo", "subtotal_linea", i), VER], i); }
    else suma += st;
    if (c !== null && pu !== null && st !== null && difiere(c * pu, st))
      push(`${i}-valor`, "rojo", "subtotal_linea", `${nombre}: ${c} × ${dinero(pu)} dan ${dinero(c * pu)}, pero dice ${dinero(st)}.`, [poner(`Usar ${dinero(c * pu)}`, "subtotal_linea", i, redondo(c * pu)), VER], i);
  });

  const subtotal = numero(f.subtotal), iva = numero(f.iva), total = numero(f.total);
  let tarifa = numero(f.tarifa_iva);
  if (tarifa !== null && tarifa > 0 && tarifa < 1) tarifa = Math.round(tarifa * 10000) / 100; // 0.15 → 15
  if (subtotal === null) push("subtotal-falta", "rojo", "subtotal", "Falta el subtotal.", [escribir("Escribirlo", "subtotal"), VER]);
  if (iva === null) push("iva-falta", "rojo", "iva", "Falta el valor del IVA.", [escribir("Escribirlo", "iva"), VER]);
  if (total === null) push("total-falta", "rojo", "total", "Falta el total.", [escribir("Escribirlo", "total"), VER]);

  if (items.length && sumaCompleta && subtotal !== null && difiere(suma, subtotal))
    push("subtotal", "rojo", "subtotal", `Los ítems suman ${dinero(suma)}, pero el subtotal dice ${dinero(subtotal)}.`, [poner(`Usar ${dinero(suma)}`, "subtotal", null, redondo(suma)), VER]);

  if (subtotal !== null && iva !== null && total !== null && difiere(subtotal + iva, total))
    push("total", "rojo", "total", `Subtotal ${dinero(subtotal)} + IVA ${dinero(iva)} dan ${dinero(subtotal + iva)}, pero la factura dice ${dinero(total)}.`, [poner(`Usar ${dinero(subtotal + iva)}`, "total", null, redondo(subtotal + iva)), VER]);

  if (subtotal !== null && iva !== null && subtotal > 0) {
    const tasa = (iva / subtotal) * 100;
    const esperada = tarifa ?? 15;
    if (difiere((subtotal * esperada) / 100, iva) && Math.abs(tasa) > 0.01)
      push("iva-tasa", "amarillo", "iva", `El IVA es el ${tasa.toFixed(1).replace(".", ",")} % del subtotal; se esperaba ${esperada} %.`, [VER, DEJAR]);
  }
  return problemas;
}
