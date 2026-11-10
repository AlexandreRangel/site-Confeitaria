CREATE TABLE IF NOT EXISTS orders (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  nsu TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  idem_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  modalidade TEXT NOT NULL DEFAULT 'retirada',
  regiao TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  desired_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  taxa_cents INTEGER,
  taxa_pendente INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  client_total_cents INTEGER,
  price_verified INTEGER NOT NULL DEFAULT 0,
  price_note TEXT NOT NULL DEFAULT '',
  capture_method TEXT NOT NULL DEFAULT '',
  transaction_nsu TEXT UNIQUE,
  invoice_slug TEXT NOT NULL DEFAULT '',
  receipt_url TEXT NOT NULL DEFAULT '',
  paid_amount_cents INTEGER,
  amount_mismatch INTEGER NOT NULL DEFAULT 0,
  paid_at TEXT,
  paid_via TEXT NOT NULL DEFAULT '',
  checkout_url TEXT NOT NULL DEFAULT '',
  history_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clients_phone ON clients(telefone);
CREATE INDEX IF NOT EXISTS clients_email ON clients(email);
CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  order_nsu TEXT NOT NULL DEFAULT '',
  transaction_nsu TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS login_failures (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
