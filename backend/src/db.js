import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "data");
const databaseFile = path.join(dataDir, "fleet.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(databaseFile);
db.pragma("foreign_keys = ON");

function ensureColumn(tableName, columnName, definition, backfillSql = null) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  if (backfillSql) {
    db.exec(backfillSql);
  }
}

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
      status TEXT NOT NULL CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plate TEXT NOT NULL UNIQUE,
      model TEXT NOT NULL,
      brand TEXT NOT NULL,
      year INTEGER NOT NULL,
      owner_name TEXT NOT NULL,
      owner_user_id INTEGER,
      status TEXT NOT NULL CHECK (status IN ('available', 'in_use', 'maintenance', 'inactive')),
      notes TEXT,
      current_odometer INTEGER NOT NULL DEFAULT 0,
      photo_url TEXT,
      fuel_type TEXT,
      maintenance_due_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      checked_in_at TEXT NOT NULL,
      checked_out_at TEXT,
      checked_in_by_user_id INTEGER NOT NULL,
      checked_out_by_user_id INTEGER,
      start_odometer INTEGER DEFAULT 0,
      end_odometer INTEGER,
      destination TEXT DEFAULT '',
      purpose TEXT DEFAULT '',
      checkin_notes TEXT DEFAULT '',
      checkout_notes TEXT DEFAULT '',
      distance_traveled INTEGER DEFAULT 0,
      usage_minutes INTEGER DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
      automatic_checkout INTEGER NOT NULL DEFAULT 0,
      automatic_checkout_reason TEXT DEFAULT '',
      owner_auto_checkout INTEGER NOT NULL DEFAULT 0,
      owner_auto_checkout_reason TEXT DEFAULT '',
      returned_to_owner INTEGER NOT NULL DEFAULT 0,
      returned_to_owner_reason TEXT DEFAULT '',
      returned_to_owner_at TEXT,
      fuel_level_start TEXT DEFAULT '',
      fuel_level_end TEXT DEFAULT '',
      driver_signature_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (checked_in_by_user_id) REFERENCES users(id),
      FOREIGN KEY (checked_out_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      company_name TEXT NOT NULL DEFAULT 'Controle de Veiculos',
      allow_user_full_history INTEGER NOT NULL DEFAULT 0,
      allow_user_dashboard_full INTEGER NOT NULL DEFAULT 1,
      preferences_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_trips_vehicle_id ON trips(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_trips_user_id ON trips(user_id);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);
    CREATE INDEX IF NOT EXISTS idx_vehicles_owner_user_id ON vehicles(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
  `);

  ensureColumn(
    "vehicles",
    "owner_user_id",
    "INTEGER",
    `
      UPDATE vehicles
      SET owner_user_id = (
        SELECT id FROM users ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id LIMIT 1
      )
      WHERE owner_user_id IS NULL
    `
  );
  ensureColumn("trips", "owner_auto_checkout", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("trips", "owner_auto_checkout_reason", "TEXT DEFAULT ''");
  ensureColumn("trips", "returned_to_owner", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("trips", "returned_to_owner_reason", "TEXT DEFAULT ''");
  ensureColumn("trips", "returned_to_owner_at", "TEXT");

  db.prepare(`
    INSERT INTO system_settings (id, company_name, allow_user_full_history, allow_user_dashboard_full, preferences_json)
    VALUES (1, 'Controle de Veiculos', 0, 1, '{}')
    ON CONFLICT(id) DO NOTHING
  `).run();
}

export function resetDatabase() {
  db.exec(`
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS system_settings;
    DROP TABLE IF EXISTS trips;
    DROP TABLE IF EXISTS vehicles;
    DROP TABLE IF EXISTS users;
  `);
  initializeDatabase();
}
