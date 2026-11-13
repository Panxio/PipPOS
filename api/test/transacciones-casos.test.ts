import type { Terminal } from '@pippos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/application/errors';
import type {
  FiltroTransacciones, NuevaTransaccion, PosicionCursor, ResultadoInsercion, Switch, TerminalRepository, TransactionRepository,
} from '../src/application/ports';
import {
  CreateTransaction, GetReceipt, InjectTransaction, ListPublicTransactions, type TransactionDeps,
} from '../src/application/transactions';
import { codificarCursor } from '../src/domain/apikey';
import type { TransaccionRegistro } from '../src/domain/transaccion';
import { FakeClock, FakeIds, MemAudit, MemSessions, MemUsers, userRecord } from './helpers/fakes';

// Casos de uso con un repositorio de transacciones SIN unicidad de requestId ni carreras: así se ve qué decide
// el caso de uso por sí mismo, no la base de datos (que por HTTP tapa la comprobación previa del reintento).
const TOKEN = 'tok-admin';
const TERMINAL = { id: 't-1', alias: 'Barra', status: 'active' } as Terminal;
const COBRO = { requestId: 'req-1', terminalId: 't-1', amount: '2500', method: 'card' as const, brand: 'visa' as const, last4: '4242' };

function registro(n: NuevaTransaccion, folio: number): TransaccionRegistro {
  const { eventos: _eventos, ...resto } = n;
  return { ...resto, folio, merchantId: 'm-1' };
}

class RepoTransacciones implements TransactionRepository {
  filas: TransaccionRegistro[] = [];
  nuevas: NuevaTransaccion[] = [];
  carrera: TransaccionRegistro | null = null; // si está, insert pierde la carrera contra esta
  filasDespues: TransaccionRegistro[] = [];
  limites: number[] = [];
  posiciones = new Map<number, PosicionCursor>();
  consultasDePosicion = 0;
  async findInMerchant(_m: string, id: string) { return this.filas.find((f) => f.id === id) ?? null; }
  async findByRequestId(_m: string, requestId: string) { return this.filas.find((f) => f.requestId === requestId) ?? null; }
  async insert(_m: string, nueva: NuevaTransaccion): Promise<ResultadoInsercion> {
    if (this.carrera !== null) return { creada: false, existente: this.carrera };
    this.nuevas.push(nueva);
    const r = registro(nueva, this.filas.length + 1);
    this.filas.push(r);
    return { creada: true, registro: r };
  }
  async list(): Promise<{ items: TransaccionRegistro[]; total: number }> { return { items: [], total: 0 }; }
  async events() { return []; }
  async listDespues(_m: string, _f: FiltroTransacciones, p: { limite: number; despuesDe: PosicionCursor | null }) {
    this.limites.push(p.limite);
    return this.filasDespues.slice(0, p.limite);
  }
  async posicionDeFolio(_m: string, folio: number) { this.consultasDePosicion++; return this.posiciones.get(folio) ?? null; }
  async voidIfAllowed() { return null; }
  async refundIfAllowed() { return null; }
}

class RepoTerminales implements TerminalRepository {
  existe = true;
  async listByMerchant() { return []; }
  async findById(_m: string, id: string) { return this.existe && id === TERMINAL.id ? TERMINAL : null; }
  async merchantIdOf(id: string) { return this.existe && id === TERMINAL.id ? 'm-1' : null; }
  async insertMany() {}
  async update() { return null; }
  async setTelemetry() { return null; }
}

let repo: RepoTransacciones, terminales: RepoTerminales, ids: FakeIds, consultasAlSwitch: number, deps: TransactionDeps;
const admin = userRecord('admin');
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  return (e as AppError).code;
};

beforeEach(() => {
  repo = new RepoTransacciones(); terminales = new RepoTerminales(); ids = new FakeIds(); consultasAlSwitch = 0;
  const sessions = new MemSessions();
  const clock = new FakeClock();
  void sessions.create({ token: TOKEN, userId: admin.id, expiresAtMs: clock.nowMs() + 3_600_000 });
  const autorizador: Switch = { async authorize() { consultasAlSwitch++; return { code: '00', authCode: '123456' }; } };
  deps = {
    users: new MemUsers([admin]), sessions, clock, transactions: repo, terminals: terminales, autorizador, ids,
    audit: new MemAudit(),
    alerts: undefined as never, // estos casos no alertan
  };
});

describe('CreateTransaction', () => {
  it('un importe o unos últimos 4 inválidos: VALIDATION_ERROR sin tocar el switch ni guardar', async () => {
    const cobrar = new CreateTransaction(deps);
    expect(await code(cobrar.execute(TOKEN, { ...COBRO, amount: '0' }))).toBe('VALIDATION_ERROR');
    expect(await code(cobrar.execute(TOKEN, { ...COBRO, last4: '42' }))).toBe('VALIDATION_ERROR');
    expect(consultasAlSwitch).toBe(0);
    expect(repo.nuevas).toEqual([]);
  });
  it('el mismo requestId otra vez: devuelve el original (creada=false) sin volver al switch ni gastar ids', async () => {
    const cobrar = new CreateTransaction(deps);
    const primero = await cobrar.execute(TOKEN, COBRO);
    expect(primero.creada).toBe(true);
    const idsUsados = ids.id(); // id-3: el cobro gastó id-1 y id-2
    expect(idsUsados).toBe('id-3');
    const segundo = await cobrar.execute(TOKEN, COBRO);
    expect(segundo).toEqual({ transaccion: primero.transaccion, creada: false });
    expect(consultasAlSwitch).toBe(1);
    expect(repo.nuevas).toHaveLength(1);
    expect(ids.id()).toBe('id-4'); // la repetición no consumió ningún id
  });
  it('el mismo requestId con otro importe: CONFLICT', async () => {
    const cobrar = new CreateTransaction(deps);
    await cobrar.execute(TOKEN, COBRO);
    expect(await code(cobrar.execute(TOKEN, { ...COBRO, amount: '9999' }))).toBe('CONFLICT');
  });
  it('terminal inexistente: NOT_FOUND sin consultar al switch', async () => {
    terminales.existe = false;
    expect(await code(new CreateTransaction(deps).execute(TOKEN, COBRO))).toBe('NOT_FOUND');
    expect(consultasAlSwitch).toBe(0);
  });
  it('pierde la carrera contra el mismo cobro: devuelve el ganador (creada=false); con otro cuerpo, CONFLICT', async () => {
    const ganador = registro({
      id: 'g-1', requestId: 'req-1', terminalId: 't-1', cashierId: admin.id, amount: 2500n, refunded: 0n, method: 'card',
      brand: 'visa', last4: '4242', status: 'approved', responseCode: '00', authCode: '000001', createdAtMs: 1, voidedAtMs: null, eventos: [],
    }, 7);
    repo.carrera = ganador;
    const r = await new CreateTransaction(deps).execute(TOKEN, COBRO);
    expect([r.creada, r.transaccion.id, r.transaccion.folio]).toEqual([false, 'g-1', 7]);
    expect(await code(new CreateTransaction(deps).execute(TOKEN, { ...COBRO, amount: '1' }))).toBe('CONFLICT');
  });
});

describe('ListPublicTransactions · cursor', () => {
  const fila = (folio: number): TransaccionRegistro => registro({
    id: `x-${folio}`, requestId: null, terminalId: 't-1', cashierId: admin.id, amount: 100n, refunded: 0n, method: 'card',
    brand: 'visa', last4: '4242', status: 'approved', responseCode: '00', authCode: '000001', createdAtMs: folio, voidedAtMs: null, eventos: [],
  }, folio);

  it('pide limit + 1 filas; con una de más hay página siguiente, con cursor del último folio devuelto', async () => {
    repo.filasDespues = [fila(5), fila(4), fila(3)];
    const p = await new ListPublicTransactions(deps).execute(TOKEN, { limit: 2 });
    expect(repo.limites).toEqual([3]);
    expect(p.items.map((t) => t.folio)).toEqual([5, 4]);
    expect(p.nextCursor).toBe(codificarCursor(4));
  });
  it('sin fila de más (última página, llena o no) o sin filas: nextCursor es null', async () => {
    const listar = new ListPublicTransactions(deps);
    repo.filasDespues = [fila(5), fila(4)];
    expect((await listar.execute(TOKEN, { limit: 2 })).nextCursor).toBeNull();
    repo.filasDespues = [fila(5)];
    expect((await listar.execute(TOKEN, { limit: 2 })).nextCursor).toBeNull();
    repo.filasDespues = [];
    expect(await listar.execute(TOKEN, { limit: 2 })).toEqual({ items: [], nextCursor: null });
  });
  it('un cursor que no es un folio canónico, o de un folio que no existe en el comercio: VALIDATION_ERROR', async () => {
    const listar = new ListPublicTransactions(deps);
    expect(await code(listar.execute(TOKEN, { limit: 2, cursor: 'no-es-cursor!' }))).toBe('VALIDATION_ERROR');
    expect(repo.consultasDePosicion).toBe(0); // un cursor mal formado ni llega al repositorio
    expect(await code(listar.execute(TOKEN, { limit: 2, cursor: codificarCursor(99) }))).toBe('VALIDATION_ERROR');
    expect(repo.limites).toEqual([]); // ni siquiera se consultó la lista
  });
  it('un cursor conocido continúa desde su posición', async () => {
    repo.posiciones.set(4, { createdAtMs: 4, folio: 4 });
    repo.filasDespues = [fila(3)];
    const p = await new ListPublicTransactions(deps).execute(TOKEN, { limit: 2, cursor: codificarCursor(4) });
    expect(p.items.map((t) => t.folio)).toEqual([3]);
  });
});

describe('GetReceipt', () => {
  it('si el terminal de la transacción ya no existe: NOT_FOUND', async () => {
    const creada = await new CreateTransaction(deps).execute(TOKEN, COBRO);
    terminales.existe = false;
    expect(await code(new GetReceipt(deps).execute(TOKEN, creada.transaccion.id))).toBe('NOT_FOUND');
  });
});

describe('InjectTransaction (costura de prueba)', () => {
  const base = {
    terminalId: 't-1', cashierId: 'u-cajero', amount: '5000', method: 'card' as const, brand: 'visa' as const,
    last4: '4242', status: 'approved' as const, createdAt: 777,
  };
  const inyectar = () => new InjectTransaction({ transactions: repo, terminals: terminales, ids });
  const eventos = () => repo.nuevas[0]?.eventos.map((e) => [e.kind, e.amount.toString(), e.atMs, e.byUserId]);

  it('terminal inexistente: NOT_FOUND; importe inválido: VALIDATION_ERROR; devuelto mayor al importe: VALIDATION_ERROR', async () => {
    terminales.existe = false;
    expect(await code(inyectar().execute(base))).toBe('NOT_FOUND');
    terminales.existe = true;
    expect(await code(inyectar().execute({ ...base, amount: '0' }))).toBe('VALIDATION_ERROR');
    expect(await code(inyectar().execute({ ...base, refundedAmount: '5001' }))).toBe('VALIDATION_ERROR');
    expect(repo.nuevas).toEqual([]);
  });
  it('aprobada: solo el evento de creación y sin fecha de anulación', async () => {
    await inyectar().execute(base);
    expect(eventos()).toEqual([['created', '5000', 777, 'u-cajero']]);
    expect(repo.nuevas[0]?.voidedAtMs).toBeNull();
    expect(repo.nuevas[0]?.refunded).toBe(0n);
  });
  it('anulada: evento de anulación por el importe completo y fecha de anulación', async () => {
    await inyectar().execute({ ...base, status: 'voided' });
    expect(eventos()).toEqual([['created', '5000', 777, 'u-cajero'], ['voided', '5000', 777, 'u-cajero']]);
    expect(repo.nuevas[0]?.voidedAtMs).toBe(777);
  });
  it('con devolución: evento de devolución por lo devuelto y el acumulado guardado', async () => {
    const t = await inyectar().execute({ ...base, status: 'partially_refunded', refundedAmount: '1200' });
    expect(eventos()).toEqual([['created', '5000', 777, 'u-cajero'], ['refunded', '1200', 777, 'u-cajero']]);
    expect(repo.nuevas[0]?.refunded).toBe(1200n);
    expect(repo.nuevas[0]?.voidedAtMs).toBeNull();
    expect(t.refundedAmount).toBe('1200');
  });
  it('devolución total igual al importe es válida', async () => {
    await inyectar().execute({ ...base, status: 'refunded', refundedAmount: '5000' });
    expect(eventos()?.[1]).toEqual(['refunded', '5000', 777, 'u-cajero']);
  });
  it('refundedAmount «0» explícito no crea evento de devolución', async () => {
    await inyectar().execute({ ...base, refundedAmount: '0' });
    expect(eventos()).toHaveLength(1);
  });
});
