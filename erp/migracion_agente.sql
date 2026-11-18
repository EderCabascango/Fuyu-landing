-- Interruptor del agente de WhatsApp (se aplica una vez en la base remota):
--   npx wrangler d1 execute fuyu-erp --remote --file=erp/migracion_agente.sql
CREATE TABLE IF NOT EXISTS ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    actualizado TEXT,
    por TEXT
);

-- Arranca APAGADO: un asesor escribe desde el número hasta que haya un chat de pruebas
INSERT OR IGNORE INTO ajustes (clave, valor, actualizado, por) VALUES ('agente_activo', '0', strftime('%Y-%m-%dT%H:%M:%S','now'), 'migracion');
