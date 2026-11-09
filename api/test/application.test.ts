import { SECTIONS } from '@pippos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/application/errors';
import { GetSession } from '../src/application/get-session';
import { Login } from '../src/application/login';
import { Logout } from '../src/application/logout';
import { UpdatePreferences } from '../src/application/update-preferences';
import { SESSION_TTL_MS } from '../src/domain/session';
import { FakeClock, FakeHasher, FakeIds, MemAudit, MemSessions, MemUsers, PASSWORD } from './helpers/fakes';

let audit: MemAudit;
let users: MemUsers, sessions: MemSessions, hasher: FakeHasher, clock: FakeClock, ids: FakeIds;
let login: Login, getSession: GetSession, logout: Logout, update: UpdatePreferences;

beforeEach(() => {
  users = new MemUsers(); sessions = new MemSessions(); hasher = new FakeHasher();
  clock = new FakeClock(); ids = new FakeIds();
  audit = new MemAudit();
  login = new Login({ users, sessions, hasher, clock, ids, audit });
  getSession = new GetSession({ users, sessions, clock });
  logout = new Logout({ sessions });
  update = new UpdatePreferences({ users, sessions, clock });
});

const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  return (e as AppError).code;
};

describe('Login (S2, S3)', () => {
  it('devuelve token y usuario con rol, secciones y comercio, sin passwordHash', async () => {
    const r = await login.execute({ email: 'supervisor@pippos.test', password: PASSWORD });
    expect(r.token).toBe('tok-1');
    expect(r.user).toMatchObject({
      id: 'u-supervisor', role: 'supervisor', merchantName: 'Boliche La Noche',
      sections: ['inicio', 'terminales', 'transacciones', 'reportes', 'alertas'],
      preferences: { language: 'es', theme: 'light' },
    });
    expect(JSON.stringify(r)).not.toMatch(/passwordHash|h:clave/);
  });
  it('guarda la sesión con vencimiento = ahora + 8 h', async () => {
    const r = await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    expect(await sessions.find(r.token)).toEqual({ userId: 'u-admin', expiresAtMs: clock.t + SESSION_TTL_MS });
  });
  it('contraseña mala → INVALID_CREDENTIALS', async () => {
    expect(await code(login.execute({ email: 'admin@pippos.test', password: 'otra' }))).toBe('INVALID_CREDENTIALS');
    expect(sessions.rows.size).toBe(0);
  });
  it('usuario inexistente → el mismo código y también verifica (mismo costo)', async () => {
    expect(await code(login.execute({ email: 'nadie@pippos.test', password: PASSWORD }))).toBe('INVALID_CREDENTIALS');
    expect(hasher.verifyCalls).toBe(1);
  });
});

describe('GetSession (S6)', () => {
  it('token vigente → usuario', async () => {
    const { token } = await login.execute({ email: 'cajero@pippos.test', password: PASSWORD });
    const u = await getSession.execute(token);
    expect(u.role).toBe('cajero');
    expect(u.sections).toEqual(['inicio', 'transacciones']);
  });
  it('sin token, token desconocido o vacío → UNAUTHENTICATED', async () => {
    for (const t of [undefined, '', 'basura']) {
      expect(await code(getSession.execute(t))).toBe('UNAUTHENTICATED');
    }
  });
  it('sin token no consulta el repositorio (con SQLite un binding undefined fallaría)', async () => {
    for (const t of [undefined, '']) await code(getSession.execute(t));
    expect(sessions.finds).toBe(0);
  });
  it('vence justo a las 8 h (el límite ya no es válido)', async () => {
    const { token } = await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    clock.t += SESSION_TTL_MS - 1;
    await expect(getSession.execute(token)).resolves.toBeTruthy();
    clock.t += 1;
    expect(await code(getSession.execute(token))).toBe('UNAUTHENTICATED');
  });
  it('sesión de un usuario que ya no existe → UNAUTHENTICATED', async () => {
    const { token } = await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    users.rows = [];
    expect(await code(getSession.execute(token))).toBe('UNAUTHENTICATED');
  });
});

describe('Logout (S7)', () => {
  it('invalida el token', async () => {
    const { token } = await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    await logout.execute(token);
    expect(await code(getSession.execute(token))).toBe('UNAUTHENTICATED');
  });
  it('sin token no toca el repositorio', async () => {
    await logout.execute(undefined);
    await logout.execute('');
    expect(sessions.deletes).toBe(0);
  });
  it('nunca falla: repetido, sin token o con token desconocido', async () => {
    await expect(logout.execute(undefined)).resolves.toBeUndefined();
    await expect(logout.execute('desconocido')).resolves.toBeUndefined();
    const { token } = await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    await logout.execute(token);
    await expect(logout.execute(token)).resolves.toBeUndefined();
  });
});

describe('UpdatePreferences (S12)', () => {
  it('guarda y devuelve el usuario con las preferencias nuevas', async () => {
    const { token } = await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    const u = await update.execute(token, { language: 'en', theme: 'dark' });
    expect(u.preferences).toEqual({ language: 'en', theme: 'dark' });
    expect((await getSession.execute(token)).preferences).toEqual({ language: 'en', theme: 'dark' });
  });
  it('sin sesión → UNAUTHENTICATED y no guarda nada', async () => {
    expect(await code(update.execute(undefined, { language: 'en', theme: 'dark' }))).toBe('UNAUTHENTICATED');
    expect(users.rows.every((u) => u.preferences.language === 'es')).toBe(true);
  });
  it('las secciones de cada rol vienen de la tabla (admin = todas)', async () => {
    const { user } = await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    expect(user.sections).toEqual([...SECTIONS]);
  });
});

describe('Login · puerto AuditLog', () => {
  it('un inicio válido registra auth.login con la forma de la entrada nueva', async () => {
    await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    expect(audit.entries).toEqual([
      { merchantId: 'm-1', atMs: clock.nowMs(), actorId: 'u-admin', actorName: 'Nombre admin', action: 'auth.login', entityType: 'user', entityId: 'u-admin', detail: {} },
    ]);
  });
  it('contraseña mala de un usuario real registra auth.login_failed sin la contraseña', async () => {
    await code(login.execute({ email: 'admin@pippos.test', password: 'otra-clave-secreta' }));
    expect(audit.entries).toEqual([
      { merchantId: 'm-1', atMs: clock.nowMs(), actorId: 'u-admin', actorName: 'Nombre admin', action: 'auth.login_failed', entityType: 'user', entityId: 'u-admin', detail: {} },
    ]);
    expect(JSON.stringify(audit.entries)).not.toContain('otra-clave-secreta');
  });
  it('correo desconocido, cuenta bloqueada o desactivada no registran nada (solo el inicio válido de control)', async () => {
    await login.execute({ email: 'admin@pippos.test', password: PASSWORD });
    await code(login.execute({ email: 'nadie@pippos.test', password: PASSWORD }));
    users.rows[1]!.active = false;
    await code(login.execute({ email: 'supervisor@pippos.test', password: PASSWORD }));
    users.rows[2]!.lockedUntilMs = clock.nowMs() + 1000;
    await code(login.execute({ email: 'cajero@pippos.test', password: PASSWORD }));
    expect(audit.entries.map((e) => e.action)).toEqual(['auth.login']);
  });
});
