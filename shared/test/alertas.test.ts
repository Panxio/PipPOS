import { describe, expect, it } from 'vitest';
import {
  ALERT_TYPES, AUDIT_ACTIONS, AlertSettingsSchema, ListAlertsQuerySchema, ListAuditQuerySchema,
} from '../src/index';

describe('constantes (A3, A7)', () => {
  it('los tres tipos de alerta, en ese orden', () => {
    expect([...ALERT_TYPES]).toEqual(['terminal_offline', 'battery_low', 'void_over_threshold']);
  });
  it('las 14 acciones auditadas, en ese orden', () => {
    expect([...AUDIT_ACTIONS]).toEqual([
      'auth.login', 'auth.login_failed', 'user.created', 'user.updated', 'user.password_changed',
      'terminal.created', 'terminal.updated', 'terminal.imported',
      'apikey.created', 'apikey.revoked', 'apikey.rotated',
      'transaction.voided', 'transaction.refunded', 'alert_settings.updated',
    ]);
  });
});

describe('AlertSettingsSchema (A2)', () => {
  const ok = { batteryBelowPct: 20, voidAtLeastAmount: '100000' };
  it('acepta los bordes: 1 y 99 %, importes de 1 a 99 999 999', () => {
    for (const v of [{ batteryBelowPct: 1 }, { batteryBelowPct: 99 }, { voidAtLeastAmount: '1' }, { voidAtLeastAmount: '99999999' }]) {
      expect(AlertSettingsSchema.safeParse({ ...ok, ...v }).success, JSON.stringify(v)).toBe(true);
    }
  });
  it('rechaza lo que cae fuera, lo no entero, el importe mal escrito y lo que falta o sobra', () => {
    const malos: unknown[] = [
      { ...ok, batteryBelowPct: 0 }, { ...ok, batteryBelowPct: 100 }, { ...ok, batteryBelowPct: 20.5 }, { ...ok, batteryBelowPct: '20' },
      { ...ok, voidAtLeastAmount: '0' }, { ...ok, voidAtLeastAmount: '01' }, { ...ok, voidAtLeastAmount: '-5' }, { ...ok, voidAtLeastAmount: 'abc' },
      { ...ok, voidAtLeastAmount: '100000000' }, { ...ok, voidAtLeastAmount: 5000 },
      { batteryBelowPct: 20 }, { voidAtLeastAmount: '1000' }, {}, { ...ok, merchantId: 'x' },
    ];
    for (const malo of malos) expect(AlertSettingsSchema.safeParse(malo).success, JSON.stringify(malo)).toBe(false);
  });
});

describe('ListAlertsQuerySchema (A5)', () => {
  it('defectos: unread=false, limit=50', () => {
    expect(ListAlertsQuerySchema.parse({})).toEqual({ unread: false, limit: 50 });
  });
  it('convierte los textos de la URL', () => {
    expect(ListAlertsQuerySchema.parse({ unread: 'true', limit: '10' })).toEqual({ unread: true, limit: 10 });
    expect(ListAlertsQuerySchema.parse({ unread: 'false', limit: '100' })).toEqual({ unread: false, limit: 100 });
    expect(ListAlertsQuerySchema.parse({ limit: '1' }).limit).toBe(1);
  });
  it('rechaza limit fuera de 1-100, textos raros, unread ajeno y parámetros desconocidos', () => {
    for (const q of [{ limit: '0' }, { limit: '101' }, { limit: 'abc' }, { limit: '1.5' }, { limit: '' }, { unread: 'yes' }, { unread: '1' }, { foo: '1' }, { page: '1' }]) {
      expect(ListAlertsQuerySchema.safeParse(q).success, JSON.stringify(q)).toBe(false);
    }
  });
});

describe('ListAuditQuerySchema (A9)', () => {
  it('defectos: page 1, pageSize 20, sin filtros', () => {
    expect(ListAuditQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });
  it('convierte from/to a número y page/pageSize, y acepta cada filtro', () => {
    expect(
      ListAuditQuerySchema.parse({ action: 'auth.login', actorId: 'u1', entityType: 'terminal', entityId: 't1', from: '10', to: '20', page: '2', pageSize: '100' }),
    ).toEqual({ action: 'auth.login', actorId: 'u1', entityType: 'terminal', entityId: 't1', from: 10, to: 20, page: 2, pageSize: 100 });
  });
  it('rechaza acción desconocida, página/tamaño fuera de rango, fechas no numéricas, vacíos y desconocidos', () => {
    for (const q of [
      { action: 'user.deleted' }, { page: '0' }, { pageSize: '0' }, { pageSize: '101' }, { from: 'ayer' }, { to: '-1' },
      { actorId: '' }, { entityType: '' }, { limit: '5' }, { cursor: 'x' },
    ]) {
      expect(ListAuditQuerySchema.safeParse(q).success, JSON.stringify(q)).toBe(false);
    }
  });
});
