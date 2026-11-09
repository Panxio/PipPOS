import { beforeEach, describe, expect, it } from 'vitest';
import { COOKIE, DEMO_PASSWORD, type Harness, login, loginToken, makeApp, withCookie } from './helpers/app';

const MINUTO = 60_000;
const CAJERO = 'cajero@pippos.test';
const MALA = 'clave-mala-123';

let h: Harness;
beforeEach(async () => { h = await makeApp({ loginRateMax: 100 }); });

const fallar = (email = CAJERO, veces = 1) => Promise.all(Array.from({ length: veces }, () => login(h, email, MALA)));
const sesiones = () => (h.db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n;
async function fallarEnSerie(veces: number, email = CAJERO): Promise<number[]> {
  const codigos: number[] = [];
  for (let i = 0; i < veces; i++) codigos.push((await login(h, email, MALA)).statusCode);
  return codigos;
}

describe('U10 bloqueo por intentos', () => {
  it('3 fallos seguidos: los tres responden 401; el 4.º, aun con la clave buena, 423 ACCOUNT_LOCKED sin sesión', async () => {
    expect(await fallarEnSerie(3)).toEqual([401, 401, 401]);
    const antes = sesiones();
    const r = await login(h, CAJERO, DEMO_PASSWORD);
    expect(r.statusCode).toBe(423);
    expect(r.json().error.code).toBe('ACCOUNT_LOCKED');
    expect(Object.keys(r.json().error).sort()).toEqual(['code', 'correlationId']);
    expect(r.cookies.find((c) => c.name === COOKIE)).toBeUndefined();
    expect(sesiones()).toBe(antes);
  });

  it('con una clave mala durante el bloqueo también 423', async () => {
    await fallarEnSerie(3);
    expect((await login(h, CAJERO, MALA)).statusCode).toBe(423);
  });

  it('15 min menos 1 ms sigue bloqueado; a los 15 min exactos entra', async () => {
    await fallarEnSerie(3);
    h.clock.advance(15 * MINUTO - 1);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(423);
    h.clock.advance(1);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(200);
  });

  it('los intentos durante el bloqueo no lo alargan', async () => {
    await fallarEnSerie(3);
    h.clock.advance(5 * MINUTO);
    expect((await login(h, CAJERO, MALA)).statusCode).toBe(423);
    h.clock.advance(10 * MINUTO);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(200);
  });

  it('un login bueno pone el contador en cero (2 malos, bueno, 2 malos, bueno)', async () => {
    expect(await fallarEnSerie(2)).toEqual([401, 401]);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(200);
    expect(await fallarEnSerie(2)).toEqual([401, 401]);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(200);
  });

  it('al vencer el bloqueo el conteo parte de cero: 3 fallos más y recién ahí vuelve a bloquear', async () => {
    await fallarEnSerie(3);
    h.clock.advance(15 * MINUTO);
    expect(await fallarEnSerie(3)).toEqual([401, 401, 401]);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(423);
  });

  it('es por usuario: bloquear al cajero no afecta al supervisor ni al admin', async () => {
    await fallarEnSerie(3);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(423);
    expect((await login(h, 'supervisor@pippos.test', DEMO_PASSWORD)).statusCode).toBe(200);
    expect((await login(h, 'admin@pippos.test', DEMO_PASSWORD)).statusCode).toBe(200);
  });

  it('el email se normaliza: los fallos con otro formato suman al mismo usuario', async () => {
    for (const email of [' CAJERO@pippos.test ', 'Cajero@Pippos.test', CAJERO]) await login(h, email, MALA);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(423);
  });

  it('correo desconocido: siempre 401 INVALID_CREDENTIALS, nunca 423, y no crea usuarios', async () => {
    const codigos = await fallarEnSerie(6, 'nadie@pippos.test');
    expect(codigos).toEqual([401, 401, 401, 401, 401, 401]);
    expect((h.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n).toBe(3);
  });

  it('usuario desactivado o invitado: nunca 423; al reactivar entra sin bloqueo', async () => {
    const admin = withCookie(await loginToken(h, 'admin'));
    const lista = (await h.app.inject({ method: 'GET', url: '/api/v1/users', headers: admin })).json().items as Array<{ id: string; email: string }>;
    const idCajero = lista.find((u) => u.email === CAJERO)!.id;
    await h.app.inject({ method: 'PATCH', url: `/api/v1/users/${idCajero}`, headers: admin, payload: { status: 'inactive' } });
    expect(await fallarEnSerie(5)).toEqual([401, 401, 401, 401, 401]);
    await h.app.inject({ method: 'PATCH', url: `/api/v1/users/${idCajero}`, headers: admin, payload: { status: 'active' } });
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(200);

    const nuevo = await h.app.inject({
      method: 'POST', url: '/api/v1/users', headers: admin, payload: { name: 'Nuevo', email: 'nuevo@pippos.test', role: 'admin' },
    });
    expect(nuevo.statusCode).toBe(201);
    expect(await fallarEnSerie(4, 'nuevo@pippos.test')).toEqual([401, 401, 401, 401]);
  });

  it('el estado del bloqueo vive en la BD, no en memoria', async () => {
    await fallarEnSerie(3);
    const fila = h.db.prepare('SELECT failed_attempts AS f, locked_until_ms AS l FROM users WHERE email = ?').get(CAJERO) as { f: number; l: number };
    expect(fila.l).toBe(h.clock.nowMs() + 15 * MINUTO);
    expect(fila.f).toBe(0);
  });

  it('en paralelo no se cuela un login bueno entre los fallos: tras 3 fallos simultáneos queda bloqueado', async () => {
    const r = await fallar(CAJERO, 3);
    expect(r.map((x) => x.statusCode)).toEqual([401, 401, 401]);
    expect((await login(h, CAJERO, DEMO_PASSWORD)).statusCode).toBe(423);
  });
});

describe('U11 sesión que expira por reloj', () => {
  it('con el reloj adelantado: a las 8 h menos 1 ms la sesión vale; a las 8 h exactas no', async () => {
    const t = withCookie(await loginToken(h, 'admin'));
    const yo = () => h.app.inject({ method: 'GET', url: '/api/v1/users', headers: t });
    h.clock.advance(8 * 60 * MINUTO - 1);
    expect((await yo()).statusCode).toBe(200);
    h.clock.advance(1);
    expect((await yo()).statusCode).toBe(401);
  });
});
