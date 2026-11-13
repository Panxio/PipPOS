import type { Branch } from '@pippos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/application/errors';
import type { BranchRepository, NewInvitation, NewUser, UserChanges, UserRecord, UserRepository } from '../src/application/ports';
import { CreateUser, UpdateUser, type UsersDeps } from '../src/application/users';
import { FakeClock, FakeIds, MemAudit, MemSessions, userRecord } from './helpers/fakes';

const TOKEN = 'tok-admin';

// Casos de uso con repositorios en memoria SIN restricción de unicidad ni transacciones: se ve qué decide
// el caso de uso por sí mismo, no la base de datos (que por HTTP tapa varias comprobaciones).
class RepoUsuarios implements UserRepository {
  altas: NewUser[] = [];
  cambios: UserChanges[] = [];
  desaparecerAlActualizar = false;
  constructor(public rows: UserRecord[]) {}
  async findByEmail(email: string) { return this.rows.find((u) => u.email === email) ?? null; }
  async findById(id: string) { return this.rows.find((u) => u.id === id) ?? null; }
  // Copias, como una base de datos: si no, «objetivo» cambiaría junto con la actualización.
  async findInMerchant(merchantId: string, id: string) {
    const u = this.rows.find((x) => x.merchantId === merchantId && x.id === id);
    return u === undefined ? null : { ...u };
  }
  async listByMerchant(merchantId: string) { return this.rows.filter((u) => u.merchantId === merchantId); }
  async savePreferences(): Promise<void> {}
  async insertInvited(user: NewUser, _invitacion: NewInvitation): Promise<void> { this.altas.push(user); }
  async update(_m: string, id: string, cambios: UserChanges): Promise<void> {
    this.cambios.push(cambios);
    if (this.desaparecerAlActualizar) { this.rows = this.rows.filter((u) => u.id !== id); return; }
    const u = this.rows.find((x) => x.id === id);
    if (u !== undefined) Object.assign(u, cambios);
  }
  async registerFailedLogin(): Promise<void> {}
  async resetFailedLogins(): Promise<void> {}
  async changePasswordHash(): Promise<void> {}
}

const CENTRO: Branch = { id: 'b-1', name: 'Centro', tills: [] };
const sucursales: BranchRepository = {
  async listByMerchant() { return [CENTRO]; },
  async findInMerchant(_m, id) { return id === CENTRO.id ? CENTRO : null; },
  async insertBranch() {},
  async insertTill() {},
};

let repo: RepoUsuarios, sessions: MemSessions, audit: MemAudit, deps: UsersDeps;
let admin = userRecord('admin');
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  return (e as AppError).code;
};
const otro = (over: Partial<UserRecord> = {}) =>
  userRecord('supervisor', { id: 'u-otro', email: 'otro@pippos.test', ...over });

function armar(extra: UserRecord[]): void {
  admin = userRecord('admin'); // propio de cada caso: algunos casos modifican al admin
  repo = new RepoUsuarios([admin, ...extra]);
  sessions = new MemSessions();
  audit = new MemAudit();
  const clock = new FakeClock();
  void sessions.create({ token: TOKEN, userId: admin.id, expiresAtMs: clock.nowMs() + 3_600_000 });
  deps = {
    users: repo, sessions, clock, branches: sucursales, ids: new FakeIds(), audit,
    invitations: { async replaceFor() {}, async accept() { return false; } },
    mailbox: { async listByMerchant() { return []; } },
  };
}

beforeEach(() => { armar([otro()]); });

describe('CreateUser', () => {
  it('correo ya registrado: CONFLICT sin insertar ni auditar', async () => {
    const entrada = { name: 'Dup', email: 'otro@pippos.test', role: 'supervisor' as const };
    expect(await code(new CreateUser(deps).execute(TOKEN, entrada))).toBe('CONFLICT');
    expect(repo.altas).toEqual([]);
    expect(audit.entries).toEqual([]);
  });
});

describe('UpdateUser · qué pide al repositorio', () => {
  it('solo manda los campos que llegaron (sin claves undefined)', async () => {
    const editar = new UpdateUser(deps);
    await editar.execute(TOKEN, 'u-otro', { status: 'inactive' });
    await editar.execute(TOKEN, 'u-otro', { role: 'admin' });
    await editar.execute(TOKEN, 'u-otro', { branchId: 'b-1' });
    expect(repo.cambios).toStrictEqual([{ active: false }, { role: 'admin' }, { branchId: 'b-1' }]);
  });
});

describe('UpdateUser · validación de rol y sucursal', () => {
  it('cambiar solo el estado no revalida una combinación heredada (cajero sin sucursal)', async () => {
    armar([otro({ id: 'u-caj', role: 'cajero', branchId: null })]);
    const u = await new UpdateUser(deps).execute(TOKEN, 'u-caj', { status: 'inactive' });
    expect(u.status).toBe('inactive');
  });
  it('pasar a cajero sin sucursal: VALIDATION_ERROR; con sucursal del comercio, ok', async () => {
    const editar = new UpdateUser(deps);
    expect(await code(editar.execute(TOKEN, 'u-otro', { role: 'cajero' }))).toBe('VALIDATION_ERROR');
    expect(repo.cambios).toEqual([]);
    const u = await editar.execute(TOKEN, 'u-otro', { role: 'cajero', branchId: 'b-1' });
    expect([u.role, u.branchId]).toEqual(['cajero', 'b-1']);
  });
  it('quitar la sucursal a un cajero: VALIDATION_ERROR', async () => {
    armar([otro({ id: 'u-caj', role: 'cajero', branchId: 'b-1' })]);
    expect(await code(new UpdateUser(deps).execute(TOKEN, 'u-caj', { branchId: null }))).toBe('VALIDATION_ERROR');
  });
  it('sucursal ajena: VALIDATION_ERROR', async () => {
    expect(await code(new UpdateUser(deps).execute(TOKEN, 'u-otro', { branchId: 'b-9' }))).toBe('VALIDATION_ERROR');
  });
});

describe('UpdateUser · sesiones', () => {
  it('desactivar corta las sesiones del usuario; activar o cambiar rol no', async () => {
    await sessions.create({ token: 'tok-otro', userId: 'u-otro', expiresAtMs: 9_999_999 });
    const editar = new UpdateUser(deps);
    await editar.execute(TOKEN, 'u-otro', { role: 'cajero', branchId: 'b-1' });
    await editar.execute(TOKEN, 'u-otro', { status: 'active' });
    expect(sessions.rows.has('tok-otro')).toBe(true);
    await editar.execute(TOKEN, 'u-otro', { status: 'inactive' });
    expect(sessions.rows.has('tok-otro')).toBe(false);
    expect(sessions.rows.has(TOKEN)).toBe(true); // la del admin que actúa sigue
  });
  it('si el usuario desaparece al actualizar: NOT_FOUND y sin auditar', async () => {
    repo.desaparecerAlActualizar = true;
    expect(await code(new UpdateUser(deps).execute(TOKEN, 'u-otro', { status: 'inactive' }))).toBe('NOT_FOUND');
    expect(audit.entries).toEqual([]);
  });
});

describe('UpdateUser · auditoría', () => {
  const detalle = () => audit.entries.map((e) => e.detail);

  it('audita solo los campos que de verdad cambian', async () => {
    const editar = new UpdateUser(deps);
    await editar.execute(TOKEN, 'u-otro', { role: 'supervisor', status: 'inactive' }); // el rol no cambia
    expect(detalle()).toEqual([{ status: 'inactive' }]);
    await editar.execute(TOKEN, 'u-otro', { role: 'admin' });
    expect(detalle()).toEqual([{ status: 'inactive' }, { role: 'admin' }]);
    expect(audit.entries[1]).toEqual(expect.objectContaining({ action: 'user.updated', entityId: 'u-otro', actorId: admin.id }));
  });
  it('sin cambios reales no hay entrada', async () => {
    const editar = new UpdateUser(deps);
    await editar.execute(TOKEN, 'u-otro', {});
    await editar.execute(TOKEN, 'u-otro', { role: 'supervisor', status: 'active', branchId: null });
    expect(audit.entries).toEqual([]);
  });
  it('la sucursal: nueva → su id; quitada → cadena vacía; igual o ausente → no consta', async () => {
    armar([otro({ branchId: 'b-1' })]);
    const editar = new UpdateUser(deps);
    await editar.execute(TOKEN, 'u-otro', { branchId: 'b-1' }); // igual
    await editar.execute(TOKEN, 'u-otro', { status: 'inactive' }); // ausente
    expect(detalle()).toEqual([{ status: 'inactive' }]);
    await editar.execute(TOKEN, 'u-otro', { branchId: null });
    expect(detalle()[1]).toEqual({ branchId: '' });
    await editar.execute(TOKEN, 'u-otro', { branchId: 'b-1' });
    expect(detalle()[2]).toEqual({ branchId: 'b-1' });
  });
  it('el estado: igual al actual no consta (un invitado «activo» sigue invitado)', async () => {
    armar([otro({ passwordHash: '' })]); // invitado
    await new UpdateUser(deps).execute(TOKEN, 'u-otro', { status: 'active' });
    expect(detalle()).toEqual([{ status: 'active' }]); // invitado → active sí es un cambio de estado derivado
  });
});

describe('UpdateUser · el admin sobre sí mismo (U8)', () => {
  it('no puede desactivarse ni quitarse el rol', async () => {
    const editar = new UpdateUser(deps);
    expect(await code(editar.execute(TOKEN, admin.id, { status: 'inactive' }))).toBe('CONFLICT');
    expect(await code(editar.execute(TOKEN, admin.id, { role: 'supervisor' }))).toBe('CONFLICT');
    expect(repo.cambios).toEqual([]);
  });
  it('sí puede mandar su mismo rol, seguir activo o cambiar su sucursal', async () => {
    const editar = new UpdateUser(deps);
    await editar.execute(TOKEN, admin.id, { role: 'admin', status: 'active' });
    const u = await editar.execute(TOKEN, admin.id, { branchId: 'b-1' });
    expect(u.branchId).toBe('b-1');
  });
});
