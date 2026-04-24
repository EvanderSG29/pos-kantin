CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users_cache (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  nickname TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  class_group TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS offline_auth_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  verifier TEXT NOT NULL,
  seeded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users_cache(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS local_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  cloud_token TEXT,
  cloud_expires_at TEXT,
  user_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users_cache(id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  commission_rate REAL NOT NULL,
  commission_base_type TEXT NOT NULL,
  payout_term_days INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT,
  pending_sync INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  transaction_date TEXT NOT NULL,
  input_by_user_id TEXT NOT NULL,
  input_by_name TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  remaining_quantity INTEGER NOT NULL,
  sold_quantity INTEGER NOT NULL,
  cost_price REAL NOT NULL,
  unit_price REAL NOT NULL,
  gross_sales REAL NOT NULL,
  total_value REAL NOT NULL,
  profit_amount REAL NOT NULL,
  commission_rate REAL NOT NULL,
  commission_base_type TEXT NOT NULL,
  commission_amount REAL NOT NULL,
  supplier_net_amount REAL NOT NULL,
  payout_term_days INTEGER NOT NULL,
  payout_due_date TEXT NOT NULL DEFAULT '',
  supplier_payout_id TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  last_synced_at TEXT,
  pending_sync INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_cursors (
  scope TEXT PRIMARY KEY,
  cursor_value TEXT,
  updated_at TEXT NOT NULL
);
