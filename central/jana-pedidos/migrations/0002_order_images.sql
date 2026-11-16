-- Imagens de personalização enviadas no checkout, ligadas ao pedido e ao item.
-- Rodar no D1 jana-pedidos (não aplicar daqui). Se a conta tiver R2, o Worker
-- guarda o arquivo no bucket e deixa nesta tabela só os metadados (storage='r2').
-- Sem R2, o arquivo fica em data (BLOB), dentro do limite do D1 (~1 MB por imagem).

CREATE TABLE IF NOT EXISTS order_images (
  id TEXT PRIMARY KEY,
  order_nsu TEXT NOT NULL,
  item_id TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  item_flavor TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage TEXT NOT NULL,
  r2_key TEXT,
  data BLOB,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_images_nsu ON order_images(order_nsu);
