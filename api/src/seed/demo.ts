import type { DatabaseSync } from 'node:sqlite';
import type { Role, Terminal } from '@pippos/shared';
import type { PasswordHasher } from '../application/ports';

// Contraseña de la demo local: datos ficticios, no es una credencial real.
export const DEMO_PASSWORD = 'demo-pippos-2026';

export const MERCHANT_ID = 'merchant-boliche-la-noche';
const MERCHANT_NAME = 'Boliche La Noche';

interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchId: string | null;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { id: 'user-admin', name: 'Admin demo', email: 'admin@pippos.test', role: 'admin', branchId: null },
  { id: 'user-supervisor', name: 'Supervisor demo', email: 'supervisor@pippos.test', role: 'supervisor', branchId: null },
  { id: 'user-cajero', name: 'Cajero demo', email: 'cajero@pippos.test', role: 'cajero', branchId: 'branch-centro' },
];

interface DemoBranch {
  id: string;
  name: string;
  tills: ReadonlyArray<{ id: string; name: string }>;
}

const DEMO_BRANCHES: readonly DemoBranch[] = [
  {
    id: 'branch-centro',
    name: 'Centro',
    tills: [
      { id: 'till-centro-1', name: 'Caja 1' },
      { id: 'till-centro-2', name: 'Caja 2' },
    ],
  },
  { id: 'branch-norte', name: 'Norte', tills: [{ id: 'till-norte-1', name: 'Caja 3' }] },
];

// Valores de alias, modelo, sucursal y caja: la spec R1 (S7) no los fija, se eligen aquí.
export const TERMINALES_DEMO: readonly Terminal[] = [
  { id: 'term-demo-0001', serial: 'TERM-0001', alias: 'Barra', model: 'PAX A920', branch: 'Centro', till: 'Caja 1',
    status: 'active', firmware: '1.4.2', batteryPct: 87, connection: 'online', createdAt: 1_700_000_000_000 },
  { id: 'term-demo-0002', serial: 'TERM-0002', alias: 'Terraza', model: 'PAX A920', branch: 'Centro', till: 'Caja 2',
    status: 'active', firmware: '1.4.2', batteryPct: 12, connection: 'offline', createdAt: 1_700_000_001_000 },
  { id: 'term-demo-0003', serial: 'TERM-0003', alias: 'Pista', model: 'PAX A80', branch: 'Norte', till: 'Caja 3',
    status: 'inactive', firmware: '1.3.9', batteryPct: 55, connection: 'offline', createdAt: 1_700_000_002_000 },
];

function userExists(db: DatabaseSync, email: string): boolean {
  return db.prepare('SELECT 1 AS x FROM users WHERE email = ?').get(email) !== undefined;
}

function sembrarSucursales(db: DatabaseSync): void {
  for (const sucursal of DEMO_BRANCHES) {
    db.prepare('INSERT OR IGNORE INTO branches (id, merchant_id, name) VALUES (?, ?, ?)').run(sucursal.id, MERCHANT_ID, sucursal.name);
    for (const caja of sucursal.tills) {
      db.prepare('INSERT OR IGNORE INTO tills (id, branch_id, name) VALUES (?, ?, ?)').run(caja.id, sucursal.id, caja.name);
    }
  }
}

function sembrarTerminales(db: DatabaseSync): void {
  for (const t of TERMINALES_DEMO) {
    db.prepare(
      `INSERT OR IGNORE INTO terminals (id, merchant_id, serial, alias, model, branch, till, status, firmware,
        battery_pct, connection, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(t.id, MERCHANT_ID, t.serial, t.alias, t.model, t.branch, t.till, t.status, t.firmware, t.batteryPct,
      t.connection, t.createdAt);
  }
}

// Idempotente: crea lo que falte y nunca pisa filas existentes (ni preferencias, sesiones ni sucursales creadas).
export async function seedDemo(db: DatabaseSync, hasher: PasswordHasher): Promise<void> {
  db.prepare('INSERT OR IGNORE INTO merchants (id, name) VALUES (?, ?)').run(MERCHANT_ID, MERCHANT_NAME);
  sembrarSucursales(db);
  sembrarTerminales(db);
  for (const user of DEMO_USERS) {
    if (userExists(db, user.email)) continue;
    const passwordHash = await hasher.hash(DEMO_PASSWORD);
    db.prepare(
      `INSERT INTO users (id, merchant_id, name, email, role, password_hash, language, theme, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(user.id, MERCHANT_ID, user.name, user.email, user.role, passwordHash, 'es', 'light', user.branchId);
  }
}
