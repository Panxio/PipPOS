// @vitest-environment jsdom
import type { AuditEntry } from '@pippos/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { es } from '../src/i18n';
import { CSV_AUDITORIA, entradasDemo, mockAlertasApi } from './alertas-mock';
import { errorApi } from './terminales-mock';

const id = (testid: string) => screen.getByTestId(testid);
const quizas = (testid: string) => screen.queryByTestId(testid);
const texto = (testid: string) => id(testid).textContent ?? '';
const escribir = (testid: string, value: string) => fireEvent.change(id(testid), { target: { value } });
const clic = (testid: string) => fireEvent.click(id(testid));
const pausa = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const consulta = (p: { query: URLSearchParams }) => Object.fromEntries(p.query);
const filas = () => within(id('audit-table')).getAllByTestId(/^audit-row-/).map((f) => f.getAttribute('data-testid'));
const celdas = (seq: number) => Array.from(id(`audit-row-${seq}`).querySelectorAll('td, th')).map((c) => c.textContent);
const finDelDia = (a: number, m: number, d: number) => new Date(a, m, d, 23, 59, 59, 999).getTime();
const inicioDelDia = (a: number, m: number, d: number) => new Date(a, m, d, 0, 0, 0, 0).getTime();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Opts = Parameters<typeof mockAlertasApi>[1];

async function abrirAuditoria(opts: Opts = {}) {
  const api = mockAlertasApi('admin', opts);
  render(<App />);
  fireEvent.click(await screen.findByTestId('nav-alertas'));
  await screen.findByTestId('alerts-page');
  clic('alerts-tab-audit');
  await waitFor(() => expect(api.auditorias().length).toBeGreaterThan(0));
  await pausa();
  return api;
}

describe('F46 pestaña Auditoría', () => {
  it('abre con GET /audit?page=1&pageSize=20 y pinta 20 filas con seq descendente', async () => {
    const api = await abrirAuditoria();
    expect(api.auditorias()).toHaveLength(1);
    expect(consulta(api.auditorias()[0])).toEqual({ page: '1', pageSize: '20' });
    expect(id('alerts-tab-audit').getAttribute('aria-selected')).toBe('true');
    const lista = filas();
    expect(lista).toHaveLength(20);
    expect(lista[0]).toBe('audit-row-45');
    expect(lista[19]).toBe('audit-row-26');
  });

  it('cada fila tiene 5 celdas: fecha, actor, acción traducida, entidad y detalle', async () => {
    await abrirAuditoria();
    const e = entradaDemo(45); // seq 45: impar → admin; 45 % 3 = 0 → terminal.updated
    expect(celdas(45)).toEqual([
      new Date(e.atMs).toLocaleString('es'), 'admin demo', es[`audit.action.${e.action}` as keyof typeof es],
      'terminal · t-45', 'alias: Caja 45',
    ]);
  });

  it('sin entityId la entidad es solo el tipo; sin detalle la celda va vacía; varios datos se unen con coma', async () => {
    const entradas: AuditEntry[] = [
      { seq: 3, atMs: 1_700_000_180_000, actorId: 'user-admin', actorName: 'admin demo', action: 'terminal.updated', entityType: 'terminal', entityId: 't-2', detail: { alias: 'Caja 2', till: 'C2' } },
      { seq: 2, atMs: 1_700_000_120_000, actorId: null, actorName: 'x@pippos.test', action: 'auth.login_failed', entityType: 'user', entityId: null, detail: {} },
      { seq: 1, atMs: 1_700_000_060_000, actorId: 'user-admin', actorName: 'admin demo', action: 'alert_settings.updated', entityType: 'alert_settings', entityId: null, detail: { batteryBelowPct: '30' } },
    ];
    await abrirAuditoria({ entradas });
    expect(celdas(3)).toEqual([new Date(1_700_000_180_000).toLocaleString('es'), 'admin demo', es['audit.action.terminal.updated'], 'terminal · t-2', 'alias: Caja 2, till: C2']);
    expect(celdas(2)).toEqual([new Date(1_700_000_120_000).toLocaleString('es'), 'x@pippos.test', es['audit.action.auth.login_failed'], 'user', '']);
    expect(celdas(1)[3]).toBe('alert_settings');
    expect(celdas(1)[4]).toBe('batteryBelowPct: 30');
  });

  it('total, página y navegación: 45 entradas = 3 páginas; los extremos deshabilitan el botón', async () => {
    const api = await abrirAuditoria();
    expect(texto('audit-total')).toBe('45');
    expect(texto('audit-page-info')).toBe('1 / 3');
    expect((id('audit-prev') as HTMLButtonElement).disabled).toBe(true);
    expect((id('audit-next') as HTMLButtonElement).disabled).toBe(false);
    clic('audit-next');
    await waitFor(() => expect(texto('audit-page-info')).toBe('2 / 3'));
    expect(consulta(api.auditorias().at(-1)!)).toEqual({ page: '2', pageSize: '20' });
    expect(filas()[0]).toBe('audit-row-25');
    clic('audit-next');
    await waitFor(() => expect(texto('audit-page-info')).toBe('3 / 3'));
    expect(filas()).toHaveLength(5);
    expect((id('audit-next') as HTMLButtonElement).disabled).toBe(true);
    clic('audit-prev');
    await waitFor(() => expect(texto('audit-page-info')).toBe('2 / 3'));
  });

  it('sin entradas: audit-empty y ninguna fila', async () => {
    await abrirAuditoria({ entradas: [] });
    expect(id('audit-empty')).toBeTruthy();
    expect(screen.queryAllByTestId(/^audit-row-/)).toHaveLength(0);
    expect(texto('audit-total')).toBe('0');
  });

  it('un 403 de la API se ve como audit-error', async () => {
    const api = mockAlertasApi('admin', { override: (p) => (p.path === '/api/v1/audit' ? errorApi(403, 'FORBIDDEN') : undefined) });
    render(<App />);
    fireEvent.click(await screen.findByTestId('nav-alertas'));
    await screen.findByTestId('alerts-page');
    clic('alerts-tab-audit');
    await waitFor(() => expect(quizas('audit-error')).toBeTruthy());
    expect(texto('audit-error')).toBe(es['error.FORBIDDEN']);
    expect(api.auditorias().length).toBeGreaterThan(0);
  });
});

describe('F47 filtros', () => {
  it('acción: añade action y vuelve a la página 1', async () => {
    const api = await abrirAuditoria();
    clic('audit-next');
    await waitFor(() => expect(texto('audit-page-info')).toBe('2 / 3'));
    escribir('audit-action', 'auth.login');
    await waitFor(() => expect(api.auditorias().at(-1)?.query.get('action')).toBe('auth.login'));
    expect(consulta(api.auditorias().at(-1)!)).toEqual({ action: 'auth.login', page: '1', pageSize: '20' });
    await waitFor(() => expect(texto('audit-total')).toBe('15'));
    expect(texto('audit-page-info')).toBe('1 / 1');
  });

  it('la lista de acciones son las de AUDIT_ACTIONS más «todas» (valor vacío)', async () => {
    await abrirAuditoria();
    const valores = within(id('audit-action')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(valores).toEqual(['', 'auth.login', 'auth.login_failed', 'user.created', 'user.updated', 'user.password_changed',
      'terminal.created', 'terminal.updated', 'terminal.imported', 'apikey.created', 'apikey.revoked', 'apikey.rotated',
      'transaction.voided', 'transaction.refunded', 'alert_settings.updated']);
  });

  it('actor: las opciones salen de GET /users y filtran por actorId', async () => {
    const api = await abrirAuditoria();
    await waitFor(() => expect(within(id('audit-actor')).getAllByRole('option')).toHaveLength(3));
    const opciones = within(id('audit-actor')).getAllByRole('option') as HTMLOptionElement[];
    expect(opciones.map((o) => o.value)).toEqual(['', 'user-admin', 'user-supervisor']);
    expect(opciones[1].textContent).toBe('admin demo');
    escribir('audit-actor', 'user-supervisor');
    await waitFor(() => expect(api.auditorias().at(-1)?.query.get('actorId')).toBe('user-supervisor'));
    await waitFor(() => expect(texto('audit-total')).toBe('22'));
  });

  it('fechas: from = 00:00:00.000 y to = 23:59:59.999 del día local, en ms', async () => {
    const api = await abrirAuditoria();
    escribir('audit-from', '2026-11-10');
    await waitFor(() => expect(api.auditorias().at(-1)?.query.get('from')).toBe(String(inicioDelDia(2026, 10, 10))));
    escribir('audit-to', '2026-11-12');
    await waitFor(() => expect(api.auditorias().at(-1)?.query.get('to')).toBe(String(finDelDia(2026, 10, 12))));
    expect(consulta(api.auditorias().at(-1)!)).toEqual({
      from: String(inicioDelDia(2026, 10, 10)), to: String(finDelDia(2026, 10, 12)), page: '1', pageSize: '20',
    });
  });

  it('el rango se aplica sobre la hora local: el día de una entrada la incluye y el siguiente no', async () => {
    const hora = new Date(2026, 10, 12, 13, 0, 0, 0).getTime();
    const entradas: AuditEntry[] = [
      { seq: 2, atMs: hora + 86_400_000, actorId: 'user-admin', actorName: 'admin demo', action: 'auth.login', entityType: 'user', entityId: 'user-admin', detail: {} },
      { seq: 1, atMs: hora, actorId: 'user-admin', actorName: 'admin demo', action: 'auth.login', entityType: 'user', entityId: 'user-admin', detail: {} },
    ];
    await abrirAuditoria({ entradas });
    escribir('audit-from', '2026-11-12');
    escribir('audit-to', '2026-11-12');
    await waitFor(() => expect(texto('audit-total')).toBe('1'));
    expect(filas()).toEqual(['audit-row-1']);
  });

  it('desde posterior a hasta: audit-range-error y no se pide nada', async () => {
    const api = await abrirAuditoria();
    const n = api.auditorias().length;
    escribir('audit-from', '2026-11-12');
    escribir('audit-to', '2026-11-10');
    expect(await screen.findByTestId('audit-range-error')).toBeTruthy();
    await pausa();
    expect(api.auditorias().filter((p) => p.query.get('to') === String(finDelDia(2026, 10, 10)))).toHaveLength(0);
    expect(api.auditorias().length).toBeLessThanOrEqual(n + 1);
    escribir('audit-to', '2026-11-12');
    await waitFor(() => expect(quizas('audit-range-error')).toBeNull());
  });
});

describe('F48 exportar CSV', () => {
  const descargas: { download: string; href: string }[] = [];
  const crear = vi.fn((_blob: Blob) => 'blob:pippos-audit-1');
  const revocar = vi.fn();

  beforeEach(() => {
    descargas.length = 0;
    crear.mockClear();
    revocar.mockClear();
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: revocar });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargas.push({ download: this.download, href: this.href });
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('sin filtros: GET /audit.csv sin parámetros y baja auditoria-todo-todo.csv', async () => {
    const api = await abrirAuditoria();
    clic('audit-export');
    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(api.csvs()).toHaveLength(1);
    expect(consulta(api.csvs()[0])).toEqual({});
    expect(descargas[0]).toEqual({ download: 'auditoria-todo-todo.csv', href: 'blob:pippos-audit-1' });
    expect(await crear.mock.calls[0][0].text()).toBe(CSV_AUDITORIA);
    expect(revocar).toHaveBeenCalledWith('blob:pippos-audit-1');
  });

  it('con filtros: los mismos parámetros, sin page ni pageSize, y el nombre lleva from y to', async () => {
    const api = await abrirAuditoria();
    escribir('audit-action', 'terminal.created');
    escribir('audit-actor', 'user-admin');
    escribir('audit-from', '2026-11-10');
    escribir('audit-to', '2026-11-12');
    await waitFor(() => expect(api.auditorias().at(-1)?.query.get('to')).toBe(String(finDelDia(2026, 10, 12))));
    clic('audit-export');
    await waitFor(() => expect(descargas).toHaveLength(1));
    const from = String(inicioDelDia(2026, 10, 10));
    const to = String(finDelDia(2026, 10, 12));
    expect(consulta(api.csvs()[0])).toEqual({ action: 'terminal.created', actorId: 'user-admin', from, to });
    expect(descargas[0].download).toBe(`auditoria-${from}-${to}.csv`);
  });

  it('con solo un extremo el otro sale como «todo»', async () => {
    await abrirAuditoria();
    escribir('audit-from', '2026-11-10');
    clic('audit-export');
    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(descargas[0].download).toBe(`auditoria-${inicioDelDia(2026, 10, 10)}-todo.csv`);
  });

  it('no lanza otra exportación mientras una está en curso', async () => {
    let soltar: (r: Response) => void = () => undefined;
    const lenta = new Promise<Response>((resolver) => { soltar = resolver; });
    const api = await abrirAuditoria({ override: (p) => (p.path === '/api/v1/audit.csv' ? lenta : undefined) });
    clic('audit-export');
    clic('audit-export');
    await pausa();
    expect(api.csvs()).toHaveLength(1);
    soltar(new Response(CSV_AUDITORIA, { status: 200, headers: { 'content-type': 'text/csv' } }));
    await waitFor(() => expect(descargas).toHaveLength(1));
  });

  it('un fallo de la API se ve como audit-export-error y no descarga nada', async () => {
    await abrirAuditoria({ override: (p) => (p.path === '/api/v1/audit.csv' ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    clic('audit-export');
    await waitFor(() => expect(quizas('audit-export-error')).toBeTruthy());
    expect(texto('audit-export-error')).toBe(es['error.INTERNAL_ERROR']);
    expect(descargas).toHaveLength(0);
  });
});

// Entrada demo por seq, para esperar lo mismo que pinta la tabla.
const entradaDemo = (seq: number): AuditEntry => entradasDemo(45).find((e) => e.seq === seq)!;
