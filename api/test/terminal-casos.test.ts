import type { Terminal } from '@pippos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../src/application/errors';
import { CreateTerminal } from '../src/application/create-terminal';
import type { TerminalRepository } from '../src/application/ports';
import type { TerminalDeps } from '../src/application/terminal-deps';
import { UpdateTerminal } from '../src/application/update-terminal';
import { planificarImportacion } from '../src/domain/terminal-import';
import { FakeClock, FakeIds, MemAudit, MemSessions, MemUsers, userRecord } from './helpers/fakes';

const TOKEN = 'tok-admin';

// Casos de uso con un repositorio SIN restricción de unicidad: así se ve qué hace el caso de uso por sí mismo,
// y no la restricción de la base de datos (que por HTTP tapa la comprobación de serial repetido).
const NUEVA = { serial: 'TERM-0100', alias: 'Barra', model: 'PAX A920', branch: 'Centro', till: 'Caja 1' };

class MemTerminals implements TerminalRepository {
  items: Terminal[] = [];
  insertManyCalls = 0;
  perderAlActualizar = false;
  async listByMerchant(): Promise<Terminal[]> { return this.items; }
  // Devuelve copias, como una base de datos: si no, «previo» cambiaría junto con la actualización.
  async findById(_m: string, id: string): Promise<Terminal | null> {
    const t = this.items.find((x) => x.id === id);
    return t === undefined ? null : { ...t };
  }
  async merchantIdOf(): Promise<string | null> { return 'm-1'; }
  async insertMany(_m: string, terminals: Terminal[]): Promise<void> { this.insertManyCalls++; this.items.push(...terminals); }
  async update(_m: string, id: string, cambios: Partial<Terminal>): Promise<Terminal | null> {
    const t = this.items.find((x) => x.id === id);
    if (t === undefined || this.perderAlActualizar) return null;
    Object.assign(t, cambios);
    return t;
  }
  async setTelemetry(): Promise<Terminal | null> { return null; }
}

let terminals: MemTerminals, audit: MemAudit, ids: FakeIds, deps: TerminalDeps;
const admin = userRecord('admin');
const code = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  return (e as AppError).code;
};

beforeEach(() => {
  terminals = new MemTerminals(); audit = new MemAudit(); ids = new FakeIds();
  const sessions = new MemSessions();
  const clock = new FakeClock();
  void sessions.create({ token: TOKEN, userId: admin.id, expiresAtMs: clock.nowMs() + 3_600_000 });
  deps = { users: new MemUsers([admin]), sessions, clock, terminals, ids, audit };
});

describe('CreateTerminal', () => {
  it('crea y audita solo el serial', async () => {
    const t = await new CreateTerminal(deps).execute(TOKEN, NUEVA);
    expect(terminals.items).toEqual([t]);
    expect(audit.entries).toEqual([
      expect.objectContaining({ action: 'terminal.created', entityType: 'terminal', entityId: t.id, actorId: admin.id, detail: { serial: 'TERM-0100' } }),
    ]);
  });
  it('serial repetido: CONFLICT sin insertar, sin auditar y sin gastar un id', async () => {
    const crear = new CreateTerminal(deps);
    await crear.execute(TOKEN, NUEVA);
    expect(await code(crear.execute(TOKEN, NUEVA))).toBe('CONFLICT');
    expect(terminals.items).toHaveLength(1);
    expect(terminals.insertManyCalls).toBe(1);
    expect(audit.entries).toHaveLength(1);
    expect(ids.id()).toBe('id-2'); // el intento rechazado no consumió id-2
  });
});

describe('UpdateTerminal · auditoría', () => {
  const crearYActualizar = async (cambios: Record<string, string>) => {
    const t = await new CreateTerminal(deps).execute(TOKEN, NUEVA);
    audit.entries.length = 0;
    await new UpdateTerminal(deps).execute(TOKEN, t.id, cambios);
    return t;
  };
  it('el detalle trae solo los campos que cambian de verdad', async () => {
    const t = await crearYActualizar({ alias: 'Nueva', branch: 'Centro' }); // branch igual: no cuenta
    expect(audit.entries).toEqual([expect.objectContaining({ action: 'terminal.updated', entityId: t.id, detail: { alias: 'Nueva' } })]);
  });
  it('sin cambios reales no hay entrada de auditoría', async () => {
    await crearYActualizar({ alias: 'Barra', till: 'Caja 1' });
    expect(audit.entries).toEqual([]);
  });
  it('si el terminal desaparece entre leer y actualizar: NOT_FOUND', async () => {
    const t = await new CreateTerminal(deps).execute(TOKEN, NUEVA);
    terminals.perderAlActualizar = true;
    expect(await code(new UpdateTerminal(deps).execute(TOKEN, t.id, { alias: 'X' }))).toBe('NOT_FOUND');
  });
});

describe('planificarImportacion · filas', () => {
  const fila = (linea: number, campos: string[]) => ({ linea, campos });
  const buena = ['TERM-0200', 'Alias', 'PAX A920', 'Centro', 'Caja 2'];
  it('una celda de más es INVALID_FIELD aunque las cinco primeras sean válidas', () => {
    const plan = planificarImportacion([fila(2, [...buena, 'sobra'])], new Set());
    expect(plan.crear).toEqual([]);
    expect(plan.invalidas).toEqual([{ row: 2, code: 'INVALID_FIELD' }]);
  });
  it('celdas de menos: se rechaza la fila (faltan campos), sin romper', () => {
    const plan = planificarImportacion([fila(2, ['TERM-0201']), fila(3, []), fila(4, buena.slice(0, 4))], new Set());
    expect(plan.crear).toEqual([]);
    expect(plan.invalidas.map((i) => i.row)).toEqual([2, 3, 4]); // la 4 solo carece de la caja (till)
  });
  it('«=», «+», «-» o «@» solo cuentan al inicio del valor', () => {
    const plan = planificarImportacion(
      [fila(2, ['TERM-0202', 'a=b', 'PAX+1', 'Centro-Norte', 'Caja@2']), fila(3, ['TERM-0203', '=1+1', 'PAX', 'C', 'T'])],
      new Set(),
    );
    expect(plan.crear.map((c) => c.serial)).toEqual(['TERM-0202']);
    expect(plan.invalidas).toEqual([{ row: 3, code: 'UNSAFE_VALUE' }]);
  });
});
