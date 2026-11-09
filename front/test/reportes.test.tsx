// @vitest-environment jsdom
import type { ReportGroupBy, Role, SalesItem } from '@pippos/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { es } from '../src/i18n';
import { errorApi, respuesta } from './terminales-mock';
import { CSV_DEMO, KPIS, mockReportesApi, VENTAS_DIA } from './reportes-mock';

const id = (testid: string) => screen.getByTestId(testid);
const quizas = (testid: string) => screen.queryByTestId(testid);
const texto = (testid: string) => id(testid).textContent ?? '';
const escribir = (testid: string, value: string) => fireEvent.change(id(testid), { target: { value } });
const clic = (testid: string) => fireEvent.click(id(testid));
const pausa = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const ultima = <T extends { query: URLSearchParams }>(l: () => T[]) => Object.fromEntries(l().at(-1)!.query);

// Hoy simulado: domingo 15-nov-2026, 14:30 hora local (solo se falsea Date; los temporizadores siguen reales).
const dia = (d: number, m = 10) => ({ desde: new Date(2026, m, d, 0, 0, 0, 0).getTime(), hasta: new Date(2026, m, d, 23, 59, 59, 999).getTime() });
const tz = (ms: number) => String(-new Date(ms).getTimezoneOffset());
function rango(primerDia: number, m = 10) {
  const desde = dia(primerDia, m).desde;
  const hasta = dia(15).hasta;
  return { from: String(desde), to: String(hasta), tzOffsetMin: tz(desde) };
}
const PRESETS = {
  today: rango(15),
  '7d': rango(9),
  '30d': rango(-14),
  month: rango(1),
} as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 15, 14, 30, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Opts = Parameters<typeof mockReportesApi>[1];

async function abrir(role: Role = 'admin', opts: Opts = {}) {
  const api = mockReportesApi(role, opts);
  render(<App />);
  fireEvent.click(await screen.findByTestId('nav-reportes'));
  await screen.findByTestId('reports-page');
  await waitFor(() => expect(api.resumenes().length).toBeGreaterThan(0));
  await waitFor(() => expect(api.ventas().length).toBeGreaterThan(0));
  await pausa(); // deja que las respuestas se pinten
  return api;
}

const celdas = (key: string) => Array.from(id(`report-row-${key}`).querySelectorAll('td, th')).map((c) => c.textContent);
const filas = () => within(id('report-table')).getAllByTestId(/^report-row-/).map((f) => f.getAttribute('data-testid'));

describe('F31 la sección Reportes', () => {
  it.each(['admin', 'supervisor'] as const)('%s: reemplaza el relleno; al ir a alertas se cambia de página', async (role) => {
    await abrir(role);
    expect(quizas('placeholder-page')).toBeNull();
    clic('nav-alertas');
    expect(await screen.findByTestId('alerts-page')).toBeTruthy();
    expect(quizas('reports-page')).toBeNull();
  });

  it('el cajero no tiene la sección (manda la API) y no se piden reportes', async () => {
    const api = mockReportesApi('cajero');
    render(<App />);
    await screen.findByTestId('nav');
    expect(quizas('nav-reportes')).toBeNull();
    expect(api.peticiones).toHaveLength(0);
  });

  it('un 403 de la API se ve como report-error', async () => {
    await abrir('supervisor', { override: (p) => (p.path.endsWith('/summary') ? errorApi(403, 'FORBIDDEN') : undefined) });
    expect(texto('report-error')).toBe(es['error.FORBIDDEN']);
  });
});

describe('F32 rango', () => {
  it('abre en 7 días: fechas locales, solo ese preset pulsado y peticiones con su rango', async () => {
    const api = await abrir();
    expect((id('report-from') as HTMLInputElement).value).toBe('2026-11-09');
    expect((id('report-to') as HTMLInputElement).value).toBe('2026-11-15');
    for (const p of ['today', '7d', '30d', 'month'])
      expect(id(`report-preset-${p}`).getAttribute('aria-pressed')).toBe(p === '7d' ? 'true' : 'false');
    expect(ultima(api.resumenes)).toMatchObject(PRESETS['7d']);
    expect(ultima(api.ventas)).toMatchObject(PRESETS['7d']);
  });

  it.each([['today', '2026-11-15'], ['30d', '2026-10-17'], ['month', '2026-11-01']] as const)('preset %s: desde %s hasta hoy', async (preset, desde) => {
    const api = await abrir();
    clic(`report-preset-${preset}`);
    await waitFor(() => expect(ultima(api.ventas)).toMatchObject(PRESETS[preset]));
    expect(ultima(api.resumenes)).toMatchObject(PRESETS[preset]);
    expect((id('report-from') as HTMLInputElement).value).toBe(desde);
    expect((id('report-to') as HTMLInputElement).value).toBe('2026-11-15');
    expect(id(`report-preset-${preset}`).getAttribute('aria-pressed')).toBe('true');
    expect(id('report-preset-7d').getAttribute('aria-pressed')).toBe('false');
  });

  it('editar una fecha manda 00:00:00.000 / 23:59:59.999 locales y suelta los presets', async () => {
    const api = await abrir();
    escribir('report-from', '2026-11-03');
    escribir('report-to', '2026-11-05');
    await waitFor(() => expect(ultima(api.ventas)).toMatchObject({ from: String(dia(3).desde), to: String(dia(5).hasta), tzOffsetMin: tz(dia(3).desde) }));
    for (const p of ['today', '7d', '30d', 'month']) expect(id(`report-preset-${p}`).getAttribute('aria-pressed')).toBe('false');
  });

  it.each([
    ['hasta antes que desde', 'report-to', '2026-11-08'],
    ['desde después de hasta', 'report-from', '2026-11-20'],
    ['campo vacío', 'report-from', ''],
    ['más de 366 días (367)', 'report-from', '2025-11-14'],
  ])('rango inválido (%s): no se pide nada y sale report-range-error', async (_n, campo, valor) => {
    const api = await abrir();
    const antes = api.peticiones.length;
    escribir(campo, valor);
    await pausa();
    expect(api.peticiones).toHaveLength(antes);
    expect(quizas('report-range-error')).not.toBeNull();
    expect((id('report-export') as HTMLButtonElement).disabled).toBe(true);
    escribir('report-from', '2026-11-01');
    escribir('report-to', '2026-11-15');
    await waitFor(() => expect(quizas('report-range-error')).toBeNull());
    await waitFor(() => expect(api.peticiones.length).toBeGreaterThan(antes));
  });

  it('365 días sí es un rango válido', async () => {
    const api = await abrir();
    escribir('report-from', '2025-11-16');
    await waitFor(() => expect(ultima(api.ventas).from).toBe(String(dia(16, 10 - 12).desde)));
    expect(quizas('report-range-error')).toBeNull();
  });
});

describe('F33 peticiones', () => {
  it('al abrir: UNA de summary (compare=true) y UNA de sales (groupBy=day), con exactamente esos parámetros', async () => {
    const api = await abrir();
    expect(api.resumenes()).toHaveLength(1);
    expect(api.ventas()).toHaveLength(1);
    expect(ultima(api.resumenes)).toEqual({ ...PRESETS['7d'], compare: 'true' });
    expect(ultima(api.ventas)).toEqual({ ...PRESETS['7d'], groupBy: 'day' });
  });

  it('report-groupby ofrece los seis agrupados en orden y cambiarlo pide solo sales', async () => {
    const api = await abrir();
    const valores = (within(id('report-groupby')).getAllByRole('option') as HTMLOptionElement[]).map((o) => o.value);
    expect(valores).toEqual(['day', 'hour', 'terminal', 'cashier', 'method', 'brand']);
    expect((id('report-groupby') as HTMLSelectElement).value).toBe('day');
    escribir('report-groupby', 'hour');
    await waitFor(() => expect(api.ventas()).toHaveLength(2));
    expect(ultima(api.ventas)).toEqual({ ...PRESETS['7d'], groupBy: 'hour' });
    expect(api.resumenes()).toHaveLength(1);
  });

  it('cambiar el rango vuelve a pedir ambas con el agrupado vigente', async () => {
    const api = await abrir();
    escribir('report-groupby', 'terminal');
    await waitFor(() => expect(api.ventas()).toHaveLength(2));
    clic('report-preset-today');
    await waitFor(() => expect(api.resumenes()).toHaveLength(2));
    await waitFor(() => expect(api.ventas()).toHaveLength(3));
    expect(ultima(api.ventas)).toEqual({ ...PRESETS.today, groupBy: 'terminal' });
  });
});

describe('F34 tarjetas', () => {
  it('muestran los valores y la variación contra el período anterior', async () => {
    await abrir();
    expect(texto('kpi-total-value')).toBe('$1.250.000');
    expect(texto('kpi-sales-value')).toBe('25');
    expect(texto('kpi-avg-value')).toBe('$50.000');
    expect(texto('kpi-attempts-value')).toBe('30');
    expect(texto('kpi-approval-value')).toBe('87,50 %');
    expect(texto('kpi-voided-value')).toBe('2');
    expect(texto('kpi-voided-amount')).toBe('$40.000');
    expect(texto('kpi-total-delta')).toBe('+25,0 %');
    expect(texto('kpi-sales-delta')).toBe('+25,0 %');
    expect(texto('kpi-avg-delta')).toBe('0,0 %');
    expect(texto('kpi-attempts-delta')).toBe('-6,2 %');
    expect(texto('kpi-approval-delta')).toBe('+7,6 %');
    expect(texto('kpi-voided-delta')).toBe('-50,0 %');
  });

  it('sin `previous` en la respuesta no existe ninguna variación, pero sí los valores', async () => {
    await abrir('admin', { anterior: null });
    expect(texto('kpi-total-value')).toBe('$1.250.000');
    for (const n of ['total', 'sales', 'avg', 'attempts', 'approval', 'voided']) expect(quizas(`kpi-${n}-delta`), n).toBeNull();
  });

  it('si el período anterior vale 0 la variación es «—»', async () => {
    await abrir('admin', { anterior: { ...KPIS, totalNet: '0', sales: 0, avgTicket: '0', attempts: 0, approvalBp: 0, voidedCount: 0, voidedAmount: '0' } });
    for (const n of ['total', 'sales', 'avg', 'attempts', 'approval', 'voided']) expect(texto(`kpi-${n}-delta`), n).toBe('—');
  });

  it('un total de 8 dígitos × muchas ventas se muestra exacto (sin number)', async () => {
    await abrir('admin', { kpis: { ...KPIS, totalNet: '9007199254740993', avgTicket: '99999999' } });
    expect(texto('kpi-total-value')).toBe('$9.007.199.254.740.993');
    expect(texto('kpi-avg-value')).toBe('$99.999.999');
  });
});

describe('F36 tabla', () => {
  it('day: una fila por ítem en el orden de la API, con etiqueta, ventas e importe', async () => {
    await abrir();
    expect(filas()).toEqual(['report-row-2026-11-13', 'report-row-2026-11-14', 'report-row-2026-11-15']);
    expect(celdas('2026-11-13')).toEqual(['2026-11-13', '10', '$500.000']);
    expect(celdas('2026-11-14')).toEqual(['2026-11-14', '0', '$0']);
    expect(celdas('2026-11-15')).toEqual(['2026-11-15', '15', '$750.000']);
  });

  it('terminal/cashier usan label (o key si viene vacío); method/brand se traducen', async () => {
    const ventas: Partial<Record<ReportGroupBy, SalesItem[]>> = {
      terminal: [{ key: 't-1', label: 'Caja 1', sales: 3, totalNet: '9000' }, { key: 't-9', label: '', sales: 1, totalNet: '1000' }],
      cashier: [{ key: 'user-admin', label: 'Ana Pérez', sales: 4, totalNet: '10000' }],
      method: [{ key: 'card', label: 'card', sales: 5, totalNet: '12000' }, { key: 'wallet', label: 'wallet', sales: 1, totalNet: '800' }],
      brand: [{ key: 'visa', label: 'visa', sales: 2, totalNet: '7000' }, { key: 'amex', label: 'amex', sales: 1, totalNet: '500' }],
      hour: [{ key: '09', label: '09', sales: 2, totalNet: '4000' }],
    };
    await abrir('admin', { ventas });
    const ir = async (g: string, key: string) => {
      escribir('report-groupby', g);
      await waitFor(() => expect(quizas(`report-row-${key}`)).not.toBeNull());
    };
    await ir('terminal', 't-1');
    expect(celdas('t-1')).toEqual(['Caja 1', '3', '$9.000']);
    expect(celdas('t-9')).toEqual(['t-9', '1', '$1.000']);
    await ir('cashier', 'user-admin');
    expect(celdas('user-admin')).toEqual(['Ana Pérez', '4', '$10.000']);
    await ir('method', 'card');
    expect(celdas('card')).toEqual([es['tx.method.card'], '5', '$12.000']);
    expect(celdas('wallet')[0]).toBe(es['tx.method.wallet']);
    await ir('brand', 'visa');
    expect(celdas('visa')).toEqual([es['tx.brand.visa'], '2', '$7.000']);
    expect(celdas('amex')[0]).toBe(es['tx.brand.amex']);
    await ir('hour', '09');
    expect(celdas('09')).toEqual(['09', '2', '$4.000']);
  });
});

describe('F37 gráfico', () => {
  const barras = () => within(id('report-chart')).getAllByTestId(/^report-bar-/);
  const altura = (key: string) => id(`report-bar-${key}`).getAttribute('height');

  it('day: svg accesible con una barra por ítem (también la de 0), proporcional al máximo', async () => {
    await abrir();
    const svg = id('report-chart');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('role')).toBe('img');
    expect((svg.getAttribute('aria-label') ?? '').trim()).not.toBe('');
    expect(barras().map((b) => b.getAttribute('data-testid'))).toEqual(['report-bar-2026-11-13', 'report-bar-2026-11-14', 'report-bar-2026-11-15']);
    expect(['2026-11-13', '2026-11-14', '2026-11-15'].map(altura)).toEqual(['66', '0', '100']);
    expect(id('report-bar-2026-11-13').getAttribute('data-value')).toBe('500000');
  });

  it('hour también lleva gráfico; terminal, cashier, method y brand solo tabla', async () => {
    const ventas = { hour: [{ key: '10', label: '10', sales: 1, totalNet: '100' }], terminal: [{ key: 't-1', label: 'Caja 1', sales: 1, totalNet: '100' }] };
    await abrir('admin', { ventas });
    escribir('report-groupby', 'hour');
    await waitFor(() => expect(quizas('report-bar-10')).not.toBeNull());
    escribir('report-groupby', 'terminal');
    await waitFor(() => expect(quizas('report-row-t-1')).not.toBeNull());
    expect(quizas('report-chart')).toBeNull();
    expect(quizas('report-table')).not.toBeNull();
  });

  it('la altura se calcula con BigInt: dos importes que number no distingue dan 100 y 99', async () => {
    const ventas = { day: [
      { key: '2026-11-14', label: '2026-11-14', sales: 1, totalNet: '9007199254740992' },
      { key: '2026-11-15', label: '2026-11-15', sales: 1, totalNet: '9007199254740993' },
    ] };
    await abrir('admin', { ventas });
    expect(altura('2026-11-15')).toBe('100');
    expect(altura('2026-11-14')).toBe('99');
  });

  it('si el máximo es 0 todas las alturas son 0 (sin dividir por cero)', async () => {
    const ventas = { day: [{ key: '2026-11-14', label: '2026-11-14', sales: 2, totalNet: '0' }] };
    await abrir('admin', { ventas });
    expect(altura('2026-11-14')).toBe('0');
  });
});

describe('F38 vacío, errores y respuestas tardías', () => {
  it('sin ninguna venta sale report-empty y no hay tabla ni gráfico', async () => {
    const ventas = { day: VENTAS_DIA.map((d) => ({ ...d, sales: 0, totalNet: '0' })) };
    await abrir('admin', { ventas });
    expect(quizas('report-empty')).not.toBeNull();
    expect(quizas('report-table')).toBeNull();
    expect(quizas('report-chart')).toBeNull();
    cleanup();
    await abrir('admin', { ventas: { day: [] } });
    expect(quizas('report-empty')).not.toBeNull();
  });

  it('un fallo de summary muestra report-error, conserva la tabla y se limpia en la siguiente consulta', async () => {
    let fallar = true;
    await abrir('admin', { override: (p) => (fallar && p.path.endsWith('/summary') ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    expect(texto('report-error')).toBe(es['error.INTERNAL_ERROR']);
    expect(quizas('report-table')).not.toBeNull();
    fallar = false;
    clic('report-preset-today');
    await waitFor(() => expect(quizas('report-error')).toBeNull());
    expect(texto('kpi-total-value')).toBe('$1.250.000');
  });

  it('un fallo de sales muestra report-error y conserva las tarjetas', async () => {
    await abrir('admin', { override: (p) => (p.path.endsWith('/sales') ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    expect(texto('report-error')).toBe(es['error.INTERNAL_ERROR']);
    expect(texto('kpi-total-value')).toBe('$1.250.000');
  });

  it.each(['summary', 'sales'] as const)('la respuesta tardía de %s de un rango anterior no pisa a la vigente', async (cual) => {
    let soltar!: (r: Response) => void;
    const lenta = new Promise<Response>((res) => { soltar = res; });
    let usada = false;
    const api = mockReportesApi('admin', {
      override: (p) => {
        if (usada || !p.path.endsWith(`/${cual}`)) return undefined;
        usada = true;
        return lenta;
      },
    });
    render(<App />);
    fireEvent.click(await screen.findByTestId('nav-reportes'));
    await screen.findByTestId('reports-page');
    await waitFor(() => expect(api.resumenes().length + api.ventas().length).toBeGreaterThanOrEqual(2));
    clic('report-preset-today');
    await waitFor(() => expect(api[cual === 'summary' ? 'resumenes' : 'ventas']()).toHaveLength(2));
    await waitFor(() => expect(quizas(cual === 'summary' ? 'kpi-total-value' : 'report-row-2026-11-15')).not.toBeNull());
    soltar(cual === 'summary'
      ? respuesta(200, { range: { from: 1, to: 2 }, kpis: { ...KPIS, totalNet: '111' } })
      : respuesta(200, { groupBy: 'day', items: [{ key: '2020-01-01', label: '2020-01-01', sales: 1, totalNet: '1' }] }));
    await pausa(80);
    if (cual === 'summary') expect(texto('kpi-total-value')).toBe('$1.250.000');
    else {
      expect(quizas('report-row-2020-01-01')).toBeNull();
      expect(filas()).toContain('report-row-2026-11-15');
    }
  });
});

describe('F39 exportar CSV', () => {
  const descargas: { download: string; href: string }[] = [];
  const crear = vi.fn((_blob: Blob) => 'blob:pippos-1');
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

  it('pide el CSV con los 4 parámetros de la vista y lo descarga con su nombre', async () => {
    const api = await abrir();
    escribir('report-groupby', 'terminal');
    await waitFor(() => expect(api.ventas()).toHaveLength(2));
    clic('report-export');
    await waitFor(() => expect(descargas).toHaveLength(1));
    expect(api.csvs()).toHaveLength(1);
    expect(ultima(api.csvs)).toEqual({ ...PRESETS['7d'], groupBy: 'terminal' });
    expect(descargas[0]).toEqual({ download: `ventas-terminal-${PRESETS['7d'].from}-${PRESETS['7d'].to}.csv`, href: 'blob:pippos-1' });
    expect(await crear.mock.calls[0][0].text()).toBe(CSV_DEMO);
    await waitFor(() => expect(revocar).toHaveBeenCalledWith('blob:pippos-1'));
  });

  it('mientras corre queda deshabilitado y un segundo clic no envía otra petición', async () => {
    let soltar!: (r: Response) => void;
    const lenta = new Promise<Response>((res) => { soltar = res; });
    const api = await abrir('admin', { override: (p) => (p.path.endsWith('/sales.csv') ? lenta : undefined) });
    clic('report-export');
    await waitFor(() => expect((id('report-export') as HTMLButtonElement).disabled).toBe(true));
    clic('report-export');
    await pausa();
    expect(api.csvs()).toHaveLength(1);
    soltar(new Response(CSV_DEMO, { status: 200, headers: { 'content-type': 'text/csv' } }));
    await waitFor(() => expect(descargas).toHaveLength(1));
    await waitFor(() => expect((id('report-export') as HTMLButtonElement).disabled).toBe(false));
  });

  it('un fallo muestra report-export-error y no cambia la vista ni descarga nada', async () => {
    await abrir('admin', { override: (p) => (p.path.endsWith('/sales.csv') ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    clic('report-export');
    await waitFor(() => expect(quizas('report-export-error')).not.toBeNull());
    expect(texto('report-export-error')).toBe(es['error.INTERNAL_ERROR']);
    expect(descargas).toHaveLength(0);
    expect(quizas('report-error')).toBeNull();
    expect(quizas('report-table')).not.toBeNull();
  });
});
