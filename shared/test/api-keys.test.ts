import { describe, expect, it } from 'vitest';
import {
  CreateApiKeySchema, CreateTransactionPublicSchema, CreateTransactionSchema, ListPublicTransactionsQuerySchema,
} from '../src/index';

const COBRO = { terminalId: 't1', amount: '1000', method: 'card', brand: 'visa', last4: '4242' };

describe('CreateApiKeySchema (K1)', () => {
  it('acepta nombre 1-60 y alcance read|write', () => {
    expect(CreateApiKeySchema.safeParse({ name: 'k', scope: 'read' }).success).toBe(true);
    expect(CreateApiKeySchema.safeParse({ name: 'x'.repeat(60), scope: 'write' }).success).toBe(true);
  });
  it('rechaza nombre vacío o de 61, alcance ajeno, campos que faltan o de más', () => {
    expect(CreateApiKeySchema.safeParse({ name: '', scope: 'read' }).success).toBe(false);
    expect(CreateApiKeySchema.safeParse({ name: 'x'.repeat(61), scope: 'read' }).success).toBe(false);
    expect(CreateApiKeySchema.safeParse({ name: 'k', scope: 'admin' }).success).toBe(false);
    expect(CreateApiKeySchema.safeParse({ name: 'k' }).success).toBe(false);
    expect(CreateApiKeySchema.safeParse({ scope: 'read' }).success).toBe(false);
    expect(CreateApiKeySchema.safeParse({ name: 'k', scope: 'read', userId: 'u' }).success).toBe(false);
  });
});

describe('CreateTransactionPublicSchema (K6)', () => {
  it('es el cobro de R3 sin requestId', () => {
    expect(CreateTransactionPublicSchema.safeParse(COBRO).success).toBe(true);
    expect(CreateTransactionPublicSchema.safeParse({ ...COBRO, requestId: crypto.randomUUID() }).success).toBe(false);
  });
  it('conserva las reglas de importe, marca, método y last4 y es estricto', () => {
    for (const mala of [{ amount: '0' }, { amount: '100000000' }, { amount: '01' }, { method: 'cash' }, { brand: 'diners' }, { last4: '123' }, { status: 'approved' }, { terminalId: '' }]) {
      expect(CreateTransactionPublicSchema.safeParse({ ...COBRO, ...mala }).success, JSON.stringify(mala)).toBe(false);
    }
    expect(CreateTransactionPublicSchema.safeParse({ ...COBRO, amount: '99999999' }).success).toBe(true);
  });
  it('el esquema interno sigue exigiendo requestId', () => {
    expect(CreateTransactionSchema.safeParse(COBRO).success).toBe(false);
  });
});

describe('ListPublicTransactionsQuerySchema (K5)', () => {
  it('defecto limit 20 y filtros como en C6', () => {
    expect(ListPublicTransactionsQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(ListPublicTransactionsQuerySchema.parse({ limit: '7', cursor: 'NQ', status: 'declined', from: '10', to: '20', min: '5', max: '9', terminalId: 't1', method: 'card', brand: 'amex' }))
      .toEqual({ limit: 7, cursor: 'NQ', status: 'declined', from: 10, to: 20, min: '5', max: '9', terminalId: 't1', method: 'card', brand: 'amex' });
  });
  it('limit 1-100 entero; page y pageSize ya no existen; estricto', () => {
    for (const mala of [{ limit: '0' }, { limit: '101' }, { limit: '1.5' }, { limit: 'x' }, { page: '1' }, { pageSize: '5' }, { cursor: '' }, { status: 'otro' }, { min: '0' }, { zzz: '1' }]) {
      expect(ListPublicTransactionsQuerySchema.safeParse(mala).success, JSON.stringify(mala)).toBe(false);
    }
    expect(ListPublicTransactionsQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(ListPublicTransactionsQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });
});
