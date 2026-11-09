import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { OffsetClock } from '../src/adapters/offset-clock';
import { openDb } from '../src/adapters/persistence/sqlite';
import { ScryptHasher } from '../src/adapters/scrypt-hasher';

describe('U11 OffsetClock', () => {
  it('sin ajuste marca la hora del sistema; advance suma y reset vuelve al origen', () => {
    const reloj = new OffsetClock();
    expect(Math.abs(reloj.nowMs() - Date.now())).toBeLessThan(1000);
    const a = reloj.nowMs();
    reloj.advance(60_000);
    reloj.advance(60_000);
    const dif = reloj.nowMs() - a;
    expect(dif).toBeGreaterThanOrEqual(120_000);
    expect(dif).toBeLessThan(121_000);
    reloj.reset();
    expect(Math.abs(reloj.nowMs() - Date.now())).toBeLessThan(1000);
  });
});

describe('U12 usuario sin contraseña', () => {
  it('ScryptHasher.verify con hash vacío es false y no lanza', async () => {
    const hasher = new ScryptHasher();
    expect(await hasher.verify('lo-que-sea', '')).toBe(false);
    expect(await hasher.verify('', '')).toBe(false);
  });
});

describe('U12 migración de una BD con el esquema de R1', () => {
  let dir = '';
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

  const ESQUEMA_R1 = `
    CREATE TABLE merchants (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE users (
      id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'cajero')), password_hash TEXT NOT NULL,
      language TEXT NOT NULL CHECK (language IN ('es', 'en')), theme TEXT NOT NULL CHECK (theme IN ('light', 'dark')));
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at_ms INTEGER NOT NULL);
    CREATE TABLE terminals (
      id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id), serial TEXT NOT NULL, alias TEXT NOT NULL,
      model TEXT NOT NULL, branch TEXT NOT NULL, till TEXT NOT NULL, status TEXT NOT NULL, firmware TEXT NOT NULL,
      battery_pct INTEGER NOT NULL, connection TEXT NOT NULL, created_at_ms INTEGER NOT NULL, UNIQUE(merchant_id, serial));`;

  function baseR1(): string {
    dir = mkdtempSync(join(tmpdir(), 'pippos-mig-'));
    const ruta = join(dir, 'r1.db');
    const viejo = new DatabaseSync(ruta);
    viejo.exec(ESQUEMA_R1);
    viejo.exec("INSERT INTO merchants VALUES ('m1', 'Comercio')");
    viejo.exec("INSERT INTO users VALUES ('u1', 'm1', 'Ana', 'ana@x.test', 'admin', 'scrypt$a$b', 'en', 'dark')");
    viejo.exec("INSERT INTO sessions VALUES ('hash1', 'u1', 99)");
    viejo.exec("INSERT INTO terminals VALUES ('t1', 'm1', 'TERM-0001', 'a', 'm', 'Centro', 'Caja 1', 'active', '1.4.2', 87, 'online', 1)");
    viejo.close();
    return ruta;
  }
  const una = (db: DatabaseSync, sql: string) => ({ ...(db.prepare(sql).get() as object) });
  const n = (db: DatabaseSync, t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

  it('conserva usuarios, sesiones y terminales y agrega columnas y tablas con sus valores por defecto', () => {
    const db = openDb(baseR1());
    expect(una(db, 'SELECT id, name, role, language, theme, password_hash AS h, active, branch_id AS b, failed_attempts AS f, locked_until_ms AS l FROM users'))
      .toEqual({ id: 'u1', name: 'Ana', role: 'admin', language: 'en', theme: 'dark', h: 'scrypt$a$b', active: 1, b: null, f: 0, l: 0 });
    expect([n(db, 'sessions'), n(db, 'terminals'), n(db, 'branches'), n(db, 'tills'), n(db, 'invitations'), n(db, 'mailbox')]).toEqual([1, 1, 0, 0, 0, 0]);
    db.close();
  });

  it('abrir otra vez la misma BD es idempotente', () => {
    const ruta = baseR1();
    openDb(ruta).close();
    const db = openDb(ruta);
    expect(n(db, 'users')).toBe(1);
    db.close();
  });
});
