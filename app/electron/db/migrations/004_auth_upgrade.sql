ALTER TABLE users_cache ADD COLUMN auth_updated_at TEXT NOT NULL DEFAULT '';

ALTER TABLE offline_auth_profiles ADD COLUMN auth_updated_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS saved_login_profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  class_group TEXT NOT NULL DEFAULT '',
  auth_updated_at TEXT NOT NULL DEFAULT '',
  trusted_device_token_enc TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(user_id) REFERENCES users_cache(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_login_profiles_email ON saved_login_profiles(email);
CREATE INDEX IF NOT EXISTS idx_saved_login_profiles_expires ON saved_login_profiles(expires_at);
