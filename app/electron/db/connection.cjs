const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function runMigrations(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `).run();

  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  files.forEach((filename) => {
    const exists = db.prepare("SELECT filename FROM schema_migrations WHERE filename = ?").get(filename);
    if (exists) return;

    const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)").run(filename, new Date().toISOString());
  });
}

function openDatabase(electronApp) {
  const dbPath = path.join(electronApp.getPath("userData"), "pos-kantin.sqlite");
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  runMigrations(db);

  return {
    db,
    dbPath,
  };
}

module.exports = {
  openDatabase,
};
