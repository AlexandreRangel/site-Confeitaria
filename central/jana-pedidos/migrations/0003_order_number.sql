-- Número curto e sequencial do pedido (1001, 1002, … 2000, 10000…).
-- OPCIONAL: o Worker novo faz exatamente isto sozinho na primeira requisição (ensureOrderNumbers),
-- de forma idempotente. Rode à mão só se quiser migrar antes do deploy:
--   npx wrangler d1 execute jana-pedidos --remote --file central/jana-pedidos/migrations/0003_order_number.sql
-- Atenção: o ALTER TABLE abaixo falha com "duplicate column name" se a coluna já existir
-- (ou seja, se o Worker novo já rodou). Nesse caso não há nada a fazer.

ALTER TABLE orders ADD COLUMN order_number INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number ON orders(order_number);
CREATE TABLE IF NOT EXISTS order_counter (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT OR IGNORE INTO order_counter (name, value)
  SELECT 'orders', MAX(1000, COALESCE(MAX(order_number), 0)) FROM orders;

-- Pedidos antigos recebem número em ordem de criação (1001, 1002, …).
-- (a subconsulta com ROW_NUMBER é materializada antes do UPDATE, então a numeração não se embaralha)
UPDATE orders
   SET order_number = c.base + r.rn
  FROM (SELECT seq, ROW_NUMBER() OVER (ORDER BY created_at, seq) AS rn
          FROM orders WHERE order_number IS NULL) AS r,
       (SELECT value AS base FROM order_counter WHERE name = 'orders') AS c
 WHERE orders.seq = r.seq;
UPDATE order_counter
   SET value = MAX(value, (SELECT COALESCE(MAX(order_number), 0) FROM orders))
 WHERE name = 'orders';
