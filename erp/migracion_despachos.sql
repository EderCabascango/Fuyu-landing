-- Despachos: lo que pasa DESPUÉS de aceptar un pedido. Solo crea tablas nuevas (no borra nada),
-- así que se puede correr sobre la base que ya tiene datos:
--
--   npx wrangler d1 execute fuyu-erp --remote --file=erp/migracion_despachos.sql
--
-- Flujo: APROBADO (sin fila aquí = faltan datos) → POR_VALIDAR (el cliente los dio por WhatsApp)
--        → VALIDADO (un asesor los revisó) → DESPACHADO (salió la flor: baja lo reservado).
--        Si el asesor los devuelve, queda DEVUELTO con el motivo y el cliente corrige por WhatsApp.

CREATE TABLE IF NOT EXISTS despachos (
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
CREATE TABLE IF NOT EXISTS despachos_salidas (
    pedido_id TEXT PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS idx_despachos_estado ON despachos(estado, actualizado);
