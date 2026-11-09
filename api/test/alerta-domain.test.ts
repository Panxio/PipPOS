import { describe, expect, it } from 'vitest';
import {
  UMBRALES_POR_DEFECTO, anulacionSobreUmbral, condicionesDeTerminal, planificarAlertas,
  type TerminalEvaluable,
} from '../src/domain/alerta';

const T = (over: Partial<TerminalEvaluable> = {}): TerminalEvaluable => ({
  id: 't1', alias: 'Barra', status: 'active', connection: 'online', batteryPct: 87, ...over,
});
const U = UMBRALES_POR_DEFECTO;

describe('umbrales por defecto (A2)', () => {
  it('20 % de batería y 100000 CLP', () => {
    expect(U).toEqual({ batteryBelowPct: 20, voidAtLeastAmount: 100000n });
  });
});

describe('condicionesDeTerminal (A3)', () => {
  it('un terminal activo, en línea y con batería sana no alerta', () => {
    expect(condicionesDeTerminal(T(), U)).toEqual([]);
  });
  it('fuera de línea → terminal_offline con clave offline:<id>', () => {
    expect(condicionesDeTerminal(T({ connection: 'offline' }), U)).toEqual([
      { type: 'terminal_offline', dedupeKey: 'offline:t1', params: { terminalId: 't1', alias: 'Barra' } },
    ]);
  });
  it('batería bajo el umbral → battery_low con clave battery:<id> y el porcentaje', () => {
    expect(condicionesDeTerminal(T({ batteryPct: 19 }), U)).toEqual([
      { type: 'battery_low', dedupeKey: 'battery:t1', params: { terminalId: 't1', alias: 'Barra', batteryPct: 19 } },
    ]);
  });
  it('el umbral de batería es estricto: igual al umbral no alerta', () => {
    expect(condicionesDeTerminal(T({ batteryPct: 20 }), U)).toEqual([]);
    expect(condicionesDeTerminal(T({ batteryPct: 15 }), { ...U, batteryBelowPct: 15 })).toEqual([]);
    expect(condicionesDeTerminal(T({ batteryPct: 14 }), { ...U, batteryBelowPct: 15 })).toHaveLength(1);
    expect(condicionesDeTerminal(T({ batteryPct: 0 }), U)).toHaveLength(1);
  });
  it('si cumple las dos, primero offline y luego battery', () => {
    const r = condicionesDeTerminal(T({ connection: 'offline', batteryPct: 12 }), U);
    expect(r.map((c) => c.type)).toEqual(['terminal_offline', 'battery_low']);
  });
  it('un terminal inactivo nunca alerta, aunque esté caído y sin batería', () => {
    expect(condicionesDeTerminal(T({ status: 'inactive', connection: 'offline', batteryPct: 1 }), U)).toEqual([]);
  });
});

describe('anulacionSobreUmbral (A3)', () => {
  it('es «mayor o igual»', () => {
    expect(anulacionSobreUmbral(100000n, 100000n)).toBe(true);
    expect(anulacionSobreUmbral(100001n, 100000n)).toBe(true);
    expect(anulacionSobreUmbral(99999n, 100000n)).toBe(false);
  });
  it('no pierde exactitud con importes de 8 dígitos', () => {
    expect(anulacionSobreUmbral(99999999n, 99999999n)).toBe(true);
    expect(anulacionSobreUmbral(99999998n, 99999999n)).toBe(false);
  });
});

describe('planificarAlertas (A4)', () => {
  it('sin alertas abiertas crea una por condición, en el orden de los terminales', () => {
    const plan = planificarAlertas(
      [T({ id: 'a', connection: 'offline', batteryPct: 5 }), T({ id: 'b' }), T({ id: 'c', batteryPct: 3 })], [], U,
    );
    expect(plan.crear.map((c) => c.dedupeKey)).toEqual(['offline:a', 'battery:a', 'battery:c']);
    expect(plan.resolver).toEqual([]);
  });
  it('no repite una clave que ya está abierta', () => {
    const plan = planificarAlertas([T({ connection: 'offline', batteryPct: 5 })], [{ dedupeKey: 'offline:t1' }], U);
    expect(plan.crear.map((c) => c.dedupeKey)).toEqual(['battery:t1']);
    expect(plan.resolver).toEqual([]);
  });
  it('resuelve la que dejó de cumplirse (reconectó, cargó, subió el umbral, se desactivó)', () => {
    const abiertas = [{ dedupeKey: 'offline:t1' }, { dedupeKey: 'battery:t1' }];
    expect(planificarAlertas([T()], abiertas, U).resolver).toEqual(['offline:t1', 'battery:t1']);
    expect(planificarAlertas([T({ connection: 'offline', batteryPct: 40 })], abiertas, U).resolver).toEqual(['battery:t1']);
    expect(planificarAlertas([T({ connection: 'offline', batteryPct: 30 })], [{ dedupeKey: 'battery:t1' }], { ...U, batteryBelowPct: 25 }).resolver)
      .toEqual(['battery:t1']);
    expect(planificarAlertas([T({ status: 'inactive', connection: 'offline', batteryPct: 1 })], abiertas, U))
      .toEqual({ crear: [], resolver: ['offline:t1', 'battery:t1'] });
  });
  it('resuelve las de un terminal que ya no existe, en el orden de las abiertas', () => {
    const plan = planificarAlertas([T({ id: 'otro' })], [{ dedupeKey: 'battery:fantasma' }, { dedupeKey: 'offline:fantasma' }], U);
    expect(plan).toEqual({ crear: [], resolver: ['battery:fantasma', 'offline:fantasma'] });
  });
  it('nunca resuelve una alerta de anulación', () => {
    expect(planificarAlertas([], [{ dedupeKey: 'void:tx1' }], U)).toEqual({ crear: [], resolver: [] });
    expect(planificarAlertas([T()], [{ dedupeKey: 'void:tx1' }, { dedupeKey: 'offline:t1' }], U).resolver).toEqual(['offline:t1']);
  });
  it('es idempotente: aplicar el plan y volver a planificar no hace nada', () => {
    const terminales = [T({ id: 'a', connection: 'offline', batteryPct: 5 }), T({ id: 'b', batteryPct: 1 }), T({ id: 'c', status: 'inactive' })];
    const primero = planificarAlertas(terminales, [{ dedupeKey: 'battery:viejo' }], U);
    const abiertas = [...primero.crear.map((c) => ({ dedupeKey: c.dedupeKey }))];
    expect(planificarAlertas(terminales, abiertas, U)).toEqual({ crear: [], resolver: [] });
  });
});
