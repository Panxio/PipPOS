import { describe, expect, it } from 'vitest';
import { makeApp } from './helpers/app';

describe('S1 GET /health', () => {
  it('200 {status:"ok"}', async () => {
    const h = await makeApp();
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('con la BD cerrada → 503 sin filtrar detalle interno', async () => {
    const h = await makeApp();
    h.db.close();
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toMatch(/sqlite|not open|stack|node_modules| at /i);
  });

  it('/health no pide sesión ni la crea', async () => {
    const h = await makeApp();
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
