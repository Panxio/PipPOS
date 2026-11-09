import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Bitácora: inmutable. Los disparadores impiden UPDATE y DELETE; la única vía de vaciarla es recrearla (reset de pruebas).
const ESQUEMA_BITACORA = `
CREATE TABLE IF NOT EXISTS audit_log (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id TEXT NOT NULL,
  at_ms       INTEGER NOT NULL,
  actor_id    TEXT,
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  detail_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_por_comercio ON audit_log (merchant_id, seq);
CREATE TRIGGER IF NOT EXISTS audit_log_sin_cambios BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'la bitácora es inmutable'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_sin_borrado BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'la bitácora es inmutable'); END;
`;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS merchants (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
  id          TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  name        TEXT NOT NULL,
  UNIQUE(merchant_id, name COLLATE NOCASE)
);
CREATE TABLE IF NOT EXISTS tills (
  id        TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  name      TEXT NOT NULL,
  UNIQUE(branch_id, name COLLATE NOCASE)
);
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  merchant_id   TEXT NOT NULL REFERENCES merchants(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'cajero')),
  password_hash TEXT NOT NULL,
  language      TEXT NOT NULL CHECK (language IN ('es', 'en')),
  theme         TEXT NOT NULL CHECK (theme IN ('light', 'dark'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invitations (
  token_hash    TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mailbox (
  id            TEXT PRIMARY KEY,
  merchant_id   TEXT NOT NULL REFERENCES merchants(id),
  to_email      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('invitation')),
  link          TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS terminals (
  id            TEXT PRIMARY KEY,
  merchant_id   TEXT NOT NULL REFERENCES merchants(id),
  serial        TEXT NOT NULL,
  alias         TEXT NOT NULL,
  model         TEXT NOT NULL,
  branch        TEXT NOT NULL,
  till          TEXT NOT NULL,
  status        TEXT NOT NULL,
  firmware      TEXT NOT NULL,
  battery_pct   INTEGER NOT NULL,
  connection    TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(merchant_id, serial)
);
CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  merchant_id   TEXT NOT NULL REFERENCES merchants(id),
  folio         INTEGER NOT NULL,
  request_id    TEXT,
  terminal_id   TEXT NOT NULL REFERENCES terminals(id),
  cashier_id    TEXT NOT NULL,
  amount        INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 99999999),
  refunded      INTEGER NOT NULL DEFAULT 0 CHECK (refunded >= 0 AND refunded <= amount),
  method        TEXT NOT NULL CHECK (method IN ('card', 'wallet')),
  brand         TEXT NOT NULL CHECK (brand IN ('visa', 'mastercard', 'amex')),
  last4         TEXT NOT NULL CHECK (length(last4) = 4),
  status        TEXT NOT NULL CHECK (status IN ('approved', 'declined', 'timeout', 'voided', 'partially_refunded', 'refunded')),
  response_code TEXT,
  auth_code     TEXT,
  created_at_ms INTEGER NOT NULL,
  voided_at_ms  INTEGER,
  UNIQUE(merchant_id, folio),
  UNIQUE(merchant_id, request_id)
);
CREATE TABLE IF NOT EXISTS api_keys (
  id              TEXT PRIMARY KEY,
  merchant_id     TEXT NOT NULL REFERENCES merchants(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,
  scope           TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  prefix          TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  created_at_ms   INTEGER NOT NULL,
  revoked_at_ms   INTEGER,
  last_used_at_ms INTEGER
);
CREATE TABLE IF NOT EXISTS transaction_events (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  kind           TEXT NOT NULL CHECK (kind IN ('created', 'voided', 'refunded')),
  amount         INTEGER NOT NULL,
  at_ms          INTEGER NOT NULL,
  by_user_id     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id             TEXT PRIMARY KEY,
  merchant_id    TEXT NOT NULL REFERENCES merchants(id),
  type           TEXT NOT NULL CHECK (type IN ('terminal_offline', 'battery_low', 'void_over_threshold')),
  dedupe_key     TEXT NOT NULL,
  params_json    TEXT NOT NULL,
  created_at_ms  INTEGER NOT NULL,
  resolved_at_ms INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_abiertas_por_clave ON alerts (merchant_id, dedupe_key) WHERE resolved_at_ms IS NULL;
CREATE TABLE IF NOT EXISTS alert_reads (
  alert_id    TEXT NOT NULL REFERENCES alerts(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  read_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (alert_id, user_id)
);
CREATE TABLE IF NOT EXISTS alert_settings (
  merchant_id          TEXT PRIMARY KEY REFERENCES merchants(id),
  battery_below_pct    INTEGER NOT NULL CHECK (battery_below_pct BETWEEN 1 AND 99),
  void_at_least_amount TEXT NOT NULL
);
${ESQUEMA_BITACORA}`;

// Columnas de R2 en users. Una BD de R1 las recibe con sus valores por defecto; una nueva ya las tiene.
const COLUMNAS_NUEVAS_USUARIOS: ReadonlyArray<readonly [string, string]> = [
  ['branch_id', 'TEXT REFERENCES branches(id)'],
  ['active', 'INTEGER NOT NULL DEFAULT 1'],
  ['failed_attempts', 'INTEGER NOT NULL DEFAULT 0'],
  ['locked_until_ms', 'INTEGER NOT NULL DEFAULT 0'],
];

function agregarColumnasQueFaltan(db: DatabaseSync): void {
  const existentes = new Set((db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name));
  for (const [nombre, definicion] of COLUMNAS_NUEVAS_USUARIOS) {
    if (!existentes.has(nombre)) db.exec(`ALTER TABLE users ADD COLUMN ${nombre} ${definicion}`);
  }
}

// Abre (y crea si hace falta) la base. Solo :memory: no toca el disco. Es idempotente y aditiva.
export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(ESQUEMA);
  agregarColumnasQueFaltan(db);
  return db;
}

// Vacía todo en orden de claves foráneas: los hijos antes que sus padres (las llaves antes que sus usuarios).
// La bitácora no se borra con DELETE (lo impiden sus disparadores): se recrea, con sus disparadores.
export function resetDb(db: DatabaseSync): void {
  db.exec(
    'DELETE FROM alert_reads; DELETE FROM alerts; DELETE FROM alert_settings; ' +
      'DELETE FROM transaction_events; DELETE FROM transactions; DELETE FROM sessions; DELETE FROM invitations; ' +
      'DELETE FROM mailbox; DELETE FROM terminals; DELETE FROM api_keys; DELETE FROM users; DELETE FROM tills; ' +
      'DELETE FROM branches; DELETE FROM merchants;',
  );
  db.exec(`DROP TABLE IF EXISTS audit_log; ${ESQUEMA_BITACORA}`);
}

export function isDatabaseEmpty(db: DatabaseSync): boolean {
  const fila = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number } | undefined;
  return (fila?.n ?? 0) === 0;
}
