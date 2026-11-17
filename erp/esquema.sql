-- ERP básico de la demo (Cloudflare D1). Solo el esquema: los datos (variedades, precios y stock de
-- demostración) se cargan aparte con erp/semilla.sql, que NO va en el repositorio.
--
--   npx wrangler d1 execute fuyu-erp --remote --file=erp/esquema.sql
--
-- Cómo se mueven las cantidades: al ACEPTAR un pedido, cada línea pasa de stock_disponible a stock_reservado
-- en su finca y queda anotada en `movimientos`. Si no alcanza el stock, el CHECK lo rechaza y no se mueve nada.

DROP TABLE IF EXISTS despachos_salidas;
DROP TABLE IF EXISTS despachos;
DROP TABLE IF EXISTS mensajes;
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS movimientos;
DROP TABLE IF EXISTS pedidos_decididos;
DROP TABLE IF EXISTS pedido_detalle;
DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS inventario;
DROP TABLE IF EXISTS productos;

CREATE TABLE productos (
    sku TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    precio_unitario REAL NOT NULL CHECK (precio_unitario >= 0.18 AND precio_unitario <= 0.39),  -- USD por tallo
    unidad TEXT NOT NULL
);

CREATE TABLE inventario (
    sku TEXT NOT NULL,
    bodega TEXT NOT NULL,                       -- finca / cuarto frío: CAY, TAB, LAT
    stock_disponible INTEGER NOT NULL CHECK (stock_disponible >= 0),
    stock_reservado INTEGER NOT NULL DEFAULT 0 CHECK (stock_reservado >= 0),
    PRIMARY KEY (sku, bodega)
);

CREATE TABLE clientes (
    id TEXT PRIMARY KEY,
    razon_social TEXT NOT NULL,
    ruc TEXT UNIQUE NOT NULL,
    pais TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    limite_credito REAL NOT NULL,
    saldo_pendiente REAL NOT NULL,
    segmento TEXT NOT NULL,
    descuento_max REAL NOT NULL
);

CREATE TABLE pedidos (
    id TEXT PRIMARY KEY,
    cliente_id TEXT NOT NULL,
    estado TEXT NOT NULL,                       -- PENDIENTE, APROBADO, RECHAZADO (y los históricos)
    total REAL NOT NULL,
    creado_por TEXT NOT NULL,
    aprobado_por TEXT,                          -- quien aceptó o rechazó en la plataforma
    fecha TEXT NOT NULL,
    wa_id TEXT,                                 -- número de WhatsApp al que se le avisa la decisión
    destino TEXT,
    decidido_en TEXT,
    motivo TEXT
);

CREATE TABLE pedido_detalle (
    pedido_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    bodega TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    precio_unitario REAL NOT NULL,
    descuento_pct REAL NOT NULL,
    subtotal REAL NOT NULL
);

-- Una fila por pedido decidido: la llave primaria impide aceptar dos veces el mismo pedido (ni siquiera a la vez)
CREATE TABLE pedidos_decididos (
    pedido_id TEXT PRIMARY KEY
);

CREATE TABLE movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    sku TEXT NOT NULL,
    bodega TEXT NOT NULL,
    tipo TEXT NOT NULL,                         -- RESERVA_PEDIDO
    cantidad INTEGER NOT NULL,
    pedido_id TEXT,
    disponible_antes INTEGER NOT NULL,
    disponible_despues INTEGER NOT NULL,
    reservado_despues INTEGER NOT NULL
);

CREATE TABLE auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    usuario TEXT NOT NULL,
    accion TEXT NOT NULL,
    payload_json TEXT,
    resultado TEXT
);

-- Conversaciones del agente por WhatsApp (lo que escribió el cliente, lo que respondió el agente y qué herramientas usó)
CREATE TABLE mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT NOT NULL,
    rol TEXT NOT NULL,                          -- cliente, agente, plataforma
    texto TEXT NOT NULL,
    ts TEXT NOT NULL,
    traza_json TEXT
);

CREATE INDEX idx_inventario_sku ON inventario(sku);
CREATE INDEX idx_detalle_pedido ON pedido_detalle(pedido_id);
CREATE INDEX idx_pedidos_estado ON pedidos(estado, fecha);
CREATE INDEX idx_movimientos_id ON movimientos(id);
CREATE INDEX idx_mensajes_wa ON mensajes(wa_id, id);

-- Despachos (después de aceptar el pedido); también está suelto en erp/migracion_despachos.sql
CREATE TABLE despachos (
    pedido_id TEXT PRIMARY KEY,
    estado TEXT NOT NULL,                       -- POR_VALIDAR, DEVUELTO, VALIDADO, DESPACHADO
    contacto_nombre TEXT NOT NULL,
    contacto_telefono TEXT NOT NULL,
    direccion TEXT NOT NULL,
    ciudad TEXT NOT NULL,
    fecha_entrega TEXT NOT NULL,                -- AAAA-MM-DD
    metodo_pago TEXT NOT NULL,                  -- transferencia, credito, contra_entrega, efectivo
    transportista TEXT,                         -- lo anota el asesor al validar
    referencia_pago TEXT,                       -- lo anota el asesor (comprobante, factura…)
    motivo_devolucion TEXT,
    validado_por TEXT,
    creado TEXT NOT NULL,
    actualizado TEXT NOT NULL
);

-- Una fila por pedido despachado: la llave primaria impide dar salida dos veces a la misma flor
CREATE TABLE despachos_salidas (
    pedido_id TEXT PRIMARY KEY
);

CREATE INDEX idx_despachos_estado ON despachos(estado, actualizado);
