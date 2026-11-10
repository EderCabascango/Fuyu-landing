// Reglas fijas (sin IA) para revisar lo que se leyó del documento.
// Cada problema: { nivel: "rojo" | "amarillo", campo, linea (índice o null), mensaje }

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const vacio = (v) => v === null || v === undefined || String(v).trim() === "";
const numero = (v) => (vacio(v) ? null : Number(String(v).replace(",", ".")));
const dinero = (n) => `$${Number(n).toFixed(2)}`;
const miles = (n) => Number(n).toLocaleString("es-EC");

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

function validarFecha(valor, campo, etiqueta, problemas, { futura = false } = {}) {
  if (vacio(valor)) {
    problemas.push({ nivel: "rojo", campo, linea: null, mensaje: `Falta la ${etiqueta}.` });
    return;
  }
  const f = new Date(`${valor}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || isNaN(f)) {
    problemas.push({ nivel: "rojo", campo, linea: null, mensaje: `La ${etiqueta} no es válida (use AAAA-MM-DD).` });
    return;
  }
  if (futura) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (f < hoy) problemas.push({ nivel: "amarillo", campo, linea: null, mensaje: `La ${etiqueta} ya pasó.` });
  }
}

// ---------------- Pedidos ----------------

export function totalTallosCalculado(l) {
  const c = numero(l.cajas), b = numero(l.bonches_por_caja), t = numero(l.tallos_por_bonche);
  return c !== null && b !== null && t !== null ? c * b * t : null;
}

export function validarPedido(p, catalogo) {
  const problemas = [];
  if (vacio(p.cliente)) problemas.push({ nivel: "rojo", campo: "cliente", linea: null, mensaje: "Falta el cliente." });
  validarFecha(p.fecha_entrega, "fecha_entrega", "fecha de entrega", problemas, { futura: true });
  if (vacio(p.mercado)) problemas.push({ nivel: "amarillo", campo: "mercado", linea: null, mensaje: "Falta el mercado o país de destino." });
  if (!p.lineas?.length) problemas.push({ nivel: "rojo", campo: null, linea: null, mensaje: "No se encontraron líneas de flor en el pedido." });

  (p.lineas || []).forEach((l, i) => {
    const n = `Línea ${i + 1}`;
    const push = (nivel, campo, mensaje) => problemas.push({ nivel, campo, linea: i, mensaje: `${n}: ${mensaje}` });

    // Variedad
    let variedad = null;
    if (vacio(l.variedad)) push("rojo", "variedad", "falta la variedad.");
    else {
      const { exacta, parecida } = buscarVariedad(l.variedad, catalogo);
      variedad = exacta;
      if (!exacta && parecida) push("amarillo", "variedad", `“${l.variedad}” no está escrita como en el catálogo. ¿Es ${parecida.nombre}?`);
      else if (!exacta) push("rojo", "variedad", `la variedad “${l.variedad}” no existe en el catálogo de la finca.`);
      if (!exacta && parecida) variedad = parecida;
    }

    // Largo
    const largo = numero(l.largo_cm);
    if (largo === null) push("rojo", "largo_cm", "falta el largo.");
    else if (variedad && !variedad.largos.includes(largo))
      push("rojo", "largo_cm", `${variedad.nombre} no se produce en ${largo} cm (hay ${variedad.largos.join(", ")} cm).`);

    // Cantidades
    const cajas = numero(l.cajas);
    if (cajas === null) push("rojo", "cajas", "falta el número de cajas.");
    else if (!(cajas > 0) || !Number.isInteger(cajas)) push("rojo", "cajas", "el número de cajas debe ser un entero mayor que cero.");

    const tpb = numero(l.tallos_por_bonche);
    if (tpb === null) push("amarillo", "tallos_por_bonche", "falta cuántos tallos lleva cada bonche.");
    else if (!catalogo.tallos_por_bonche_permitidos.includes(tpb))
      push("amarillo", "tallos_por_bonche", `bonches de ${tpb} tallos no son estándar en la finca (${catalogo.tallos_por_bonche_permitidos.join(" o ")}).`);

    if (numero(l.bonches_por_caja) === null) push("amarillo", "bonches_por_caja", "falta cuántos bonches van por caja.");

    const calculado = totalTallosCalculado(l);
    const declarado = numero(l.total_tallos_declarado);
    if (calculado !== null && declarado !== null && calculado !== declarado)
      push("rojo", "total_tallos_declarado",
        `las cantidades no cuadran: ${cajas} cajas × ${numero(l.bonches_por_caja)} bonches × ${tpb} tallos = ${miles(calculado)}, pero el pedido dice ${miles(declarado)}.`);

    // Precio
    const precio = numero(l.precio_tallo);
    if (precio !== null && variedad && (precio < variedad.precio_min || precio > variedad.precio_max))
      push("amarillo", "precio_tallo", `el precio ${dinero(precio)} por tallo está fuera de lo habitual para ${variedad.nombre} (${dinero(variedad.precio_min)}–${dinero(variedad.precio_max)}).`);
  });
  return problemas;
}

// ---------------- Facturas ----------------

const difiere = (a, b) => Math.abs(a - b) > 0.011;

export function validarFactura(f) {
  const problemas = [];
  const push = (nivel, campo, mensaje, linea = null) => problemas.push({ nivel, campo, linea, mensaje });

  if (vacio(f.proveedor)) push("rojo", "proveedor", "Falta el nombre del proveedor.");

  const ruc = String(f.ruc ?? "").replace(/\D/g, "");
  if (vacio(f.ruc)) push("rojo", "ruc", "Falta el RUC del proveedor.");
  else if (ruc.length !== 13) push("rojo", "ruc", `El RUC debe tener 13 dígitos y tiene ${ruc.length}.`);
  else if (!ruc.endsWith("001")) push("amarillo", "ruc", "El RUC normalmente termina en 001. Revíselo.");

  if (vacio(f.numero_factura)) push("rojo", "numero_factura", "Falta el número de factura.");
  else if (!/^\d{3}-\d{3}-\d{9}$/.test(String(f.numero_factura).trim()))
    push("amarillo", "numero_factura", "El número de factura no tiene la forma 001-001-000000123.");

  validarFecha(f.fecha, "fecha", "fecha de la factura", problemas);

  const items = f.items || [];
  if (!items.length) push("rojo", null, "No se encontraron ítems en la factura.");

  let suma = 0, sumaCompleta = true;
  items.forEach((it, i) => {
    const c = numero(it.cantidad), pu = numero(it.precio_unitario), st = numero(it.subtotal_linea);
    if (vacio(it.descripcion)) push("amarillo", "descripcion", `Ítem ${i + 1}: falta la descripción.`, i);
    if (st === null) { sumaCompleta = false; push("rojo", "subtotal_linea", `Ítem ${i + 1}: falta el valor.`, i); }
    else suma += st;
    if (c !== null && pu !== null && st !== null && difiere(c * pu, st))
      push("rojo", "subtotal_linea", `Ítem ${i + 1}: ${c} × ${dinero(pu)} = ${dinero(c * pu)}, pero dice ${dinero(st)}.`, i);
  });

  const subtotal = numero(f.subtotal), iva = numero(f.iva), total = numero(f.total), tarifa = numero(f.tarifa_iva);
  if (subtotal === null) push("rojo", "subtotal", "Falta el subtotal.");
  if (iva === null) push("rojo", "iva", "Falta el valor del IVA.");
  if (total === null) push("rojo", "total", "Falta el total.");

  if (items.length && sumaCompleta && subtotal !== null && difiere(suma, subtotal))
    push("rojo", "subtotal", `Los ítems suman ${dinero(suma)}, pero el subtotal dice ${dinero(subtotal)}.`);

  if (subtotal !== null && iva !== null && total !== null && difiere(subtotal + iva, total))
    push("rojo", "total", `Subtotal ${dinero(subtotal)} + IVA ${dinero(iva)} = ${dinero(subtotal + iva)}, pero el total dice ${dinero(total)}.`);

  if (subtotal !== null && iva !== null && subtotal > 0) {
    const tasa = (iva / subtotal) * 100;
    const esperada = tarifa ?? 15;
    if (difiere((subtotal * esperada) / 100, iva) && Math.abs(tasa) > 0.01)
      push("amarillo", "iva", `El IVA equivale al ${tasa.toFixed(1)} % del subtotal; se esperaba ${esperada} %.`);
  }
  return problemas;
}
