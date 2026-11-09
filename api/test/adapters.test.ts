import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ScryptHasher } from '../src/adapters/scrypt-hasher';
import { SystemClock } from '../src/adapters/system-clock';
import { UuidIds } from '../src/adapters/uuid-ids';
import { openDb, resetDb } from '../src/adapters/persistence/sqlite';
import { SqliteSessionRepository, SqliteUserRepository } from '../src/adapters/persistence/repositories';
import { DEMO_PASSWORD, seedDemo } from '../src/seed/demo';
import { FakeHasher } from './helpers/fakes';

const filas = (db: DatabaseSync, t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

describe('ScryptHasher', () => {
  const hasher = new ScryptHasher();

  it('verifica la buena, rechaza la mala y no guarda la contraseña en claro', async () => {
    const h = await hasher.hash('clave-1');
    expect(h).not.toContain('clave-1');
    expect(await hasher.verify('clave-1', h)).toBe(true);
    expect(await hasher.verify('clave-2', h)).toBe(false);
    expect(await hasher.verify('', h)).toBe(false);
  });

  it('usa una sal distinta por contraseña', async () => {
    const [a, b] = [await hasher.hash('misma'), await hasher.hash('misma')];
    expect(a).not.toBe(b);
    expect(await hasher.verify('misma', a)).toBe(true);
    expect(await hasher.verify('misma', b)).toBe(true);
  });

  it('con hash null o corrupto devuelve false sin lanzar', async () => {
    for (const plain of ['x', '', 'no-existe', 'dummy', DEMO_PASSWORD]) expect(await hasher.verify(plain, null)).toBe(false);
    for (const roto of ['', 'basura', 'scrypt$', '$$$', 'a'.repeat(500)]) {
      expect(await hasher.verify('x', roto)).toBe(false);
    }
  });
});

describe('SystemClock y UuidIds', () => {
  it('el reloj real da milisegundos actuales', () => {
    const antes = Date.now();
    const t = new SystemClock().nowMs();
    expect(t).toBeGreaterThanOrEqual(antes);
    expect(t).toBeLessThanOrEqual(Date.now());
  });

  it('id() es UUID v4 y token() son 43 caracteres base64url, todos distintos', () => {
    const ids = new UuidIds();
    expect(ids.id()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const tokens = new Set(Array.from({ length: 500 }, () => ids.token()));
    expect(tokens.size).toBe(500);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('persistencia SQLite', () => {
  it('openDb crea merchants, users y sessions', () => {
    const db = openDb(':memory:');
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(tablas).toEqual(expect.arrayContaining(['merchants', 'users', 'sessions']));
  });

  it('seedDemo: 1 comercio y 3 usuarios con la contraseña hasheada; correrlo dos veces no duplica', async () => {
    const db = openDb(':memory:');
    const hasher = new ScryptHasher();
    await seedDemo(db, hasher);
    await seedDemo(db, hasher);
    expect(filas(db, 'merchants')).toBe(1);
    expect(filas(db, 'users')).toBe(3);
    const users = new SqliteUserRepository(db);
    const admin = await users.findByEmail('admin@pippos.test');
    expect(admin?.role).toBe('admin');
    expect(admin?.merchantName).toBe('Boliche La Noche');
    expect(admin?.passwordHash).not.toContain(DEMO_PASSWORD);
    expect(await hasher.verify(DEMO_PASSWORD, admin?.passwordHash ?? null)).toBe(true);
    expect((await users.findByEmail('supervisor@pippos.test'))?.role).toBe('supervisor');
    expect((await users.findByEmail('cajero@pippos.test'))?.role).toBe('cajero');
  });

  it('SqliteUserRepository: findById, desconocidos → null, la inyección SQL no devuelve filas, savePreferences persiste', async () => {
    const db = openDb(':memory:');
    await seedDemo(db, new FakeHasher());
    const users = new SqliteUserRepository(db);
    const admin = await users.findByEmail('admin@pippos.test');
    expect(admin).not.toBeNull();
    expect((await users.findById(admin?.id ?? ''))?.email).toBe('admin@pippos.test');
    expect(await users.findById('no-existe')).toBeNull();
    expect(await users.findByEmail("' OR '1'='1")).toBeNull();
    expect(await users.findByEmail('ADMIN@pippos.test')).toBeNull(); // la normalización es de la capa HTTP/Zod, no del repositorio
    await users.savePreferences(admin?.id ?? '', { language: 'en', theme: 'dark' });
    expect((await users.findById(admin?.id ?? ''))?.preferences).toEqual({ language: 'en', theme: 'dark' });
    const cajero = await users.findByEmail('cajero@pippos.test');
    expect(cajero?.preferences).toEqual({ language: 'es', theme: 'light' });
  });

  it('SqliteSessionRepository: create, find, delete; token desconocido → null; delete repetido no falla', async () => {
    const db = openDb(':memory:');
    const sessions = new SqliteSessionRepository(db);
    await sessions.create({ token: 'abc', userId: 'u-1', expiresAtMs: 5_000 });
    expect(await sessions.find('abc')).toEqual({ userId: 'u-1', expiresAtMs: 5_000 });
    expect(await sessions.find('abd')).toBeNull();
    expect(await sessions.find("' OR '1'='1")).toBeNull();
    await sessions.delete('abc');
    await sessions.delete('abc');
    expect(await sessions.find('abc')).toBeNull();
  });

  it('resetDb vacía las 3 tablas', async () => {
    const db = openDb(':memory:');
    await seedDemo(db, new FakeHasher());
    await new SqliteSessionRepository(db).create({ token: 't', userId: 'u', expiresAtMs: 1 });
    resetDb(db);
    expect([filas(db, 'merchants'), filas(db, 'users'), filas(db, 'sessions')]).toEqual([0, 0, 0]);
  });
});
