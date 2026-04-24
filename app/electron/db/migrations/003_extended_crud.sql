ALTER TABLE users_cache ADD COLUMN pending_sync INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  buyer_name TEXT NOT NULL,
  class_or_category TEXT NOT NULL DEFAULT '',
  opening_balance REAL NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aktif',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_imported_at TEXT,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS savings (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',
  deposit_amount REAL NOT NULL DEFAULT 0,
  change_balance REAL NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL,
  recorded_by_user_id TEXT NOT NULL DEFAULT '',
  recorded_by_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_finance (
  id TEXT PRIMARY KEY,
  finance_date TEXT NOT NULL,
  gross_amount REAL NOT NULL DEFAULT 0,
  change_total REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  last_synced_at TEXT,
  pending_sync INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS change_entries (
  id TEXT PRIMARY KEY,
  daily_finance_id TEXT NOT NULL,
  finance_date TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  buyer_name_snapshot TEXT NOT NULL,
  change_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'belum',
  settled_at TEXT NOT NULL DEFAULT '',
  settled_by_user_id TEXT NOT NULL DEFAULT '',
  settled_by_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  last_synced_at TEXT,
  pending_sync INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supplier_payouts (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  supplier_name_snapshot TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  due_date TEXT NOT NULL,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  total_gross_sales REAL NOT NULL DEFAULT 0,
  total_profit REAL NOT NULL DEFAULT 0,
  total_commission REAL NOT NULL DEFAULT 0,
  total_supplier_net_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'paid',
  paid_at TEXT NOT NULL DEFAULT '',
  paid_by_user_id TEXT NOT NULL DEFAULT '',
  paid_by_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT,
  pending_sync INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_cache_pending ON users_cache(pending_sync, updated_at);
CREATE INDEX IF NOT EXISTS idx_buyers_status_name ON buyers(status, buyer_name);
CREATE INDEX IF NOT EXISTS idx_savings_student ON savings(student_id, student_name);
CREATE INDEX IF NOT EXISTS idx_daily_finance_owner ON daily_finance(created_by_user_id, deleted_at, finance_date);
CREATE INDEX IF NOT EXISTS idx_daily_finance_pending ON daily_finance(pending_sync, updated_at);
CREATE INDEX IF NOT EXISTS idx_change_entries_finance ON change_entries(daily_finance_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_change_entries_status ON change_entries(status, deleted_at, finance_date);
CREATE INDEX IF NOT EXISTS idx_change_entries_pending ON change_entries(pending_sync, updated_at);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_supplier ON supplier_payouts(supplier_id, due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payouts_pending ON supplier_payouts(pending_sync, updated_at);
