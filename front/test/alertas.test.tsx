// @vitest-environment jsdom
import type { Role } from '@pippos/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { en, es } from '../src/i18n';
import { ALERTA_BATERIA, ALERTA_OFFLINE, mockAlertasApi } from './alertas-mock';
import { errorApi } from './terminales-mock';

const id = (testid: string) => screen.getByTestId(testid);
const quizas = (testid: string) => screen.queryByTestId(testid);
const texto = (testid: string) => id(testid).textContent ?? '';
const escribir = (testid: string, value: string) => fireEvent.change(id(testid), { target: { value } });
const clic = (testid: string) => fireEvent.click(id(testid));
const pausa = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const consulta = (p: { query: URLSearchParams }) => Object.fromEntries(p.query);
const marcadores = (contenedor: HTMLElement, prefijo: string) =>
  within(contenedor).queryAllByTestId(new RegExp(`^${prefijo}-`)).map((e) => e.getAttribute('data-testid'));

const TEXTO_OFFLINE = 'Terminal Caja 2 sin conexión';
const TEXTO_BATERIA = 'Terminal Caja 2 con batería baja (12 %)';
const TEXTO_ANULACION = 'Anulación del folio F-000009 por $150.000';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Opts = Parameters<typeof mockAlertasApi>[1];

async function abrir(role: Role = 'admin', opts: Opts = {}) {
  const api = mockAlertasApi(role, opts);
  render(<App />);
  await screen.findByTestId('app-shell');
  if (role !== 'cajero') await waitFor(() => expect(api.listas().length).toBeGreaterThan(0));
  await pausa();
  return api;
}

async function abrirSeccion(role: Role = 'admin', opts: Opts = {}) {
  const api = await abrir(role, opts);
  clic('nav-alertas');
  await screen.findByTestId('alerts-page');
  return api;
}

describe('F41 la campana', () => {
  it.each(['admin', 'supervisor', 'cajero'] as const)('%s: la campana y la consulta de alertas existen solo si el rol puede leerlas', async (role) => {
    const api = await abrir(role);
    const conAlertas = role !== 'cajero';
    expect(quizas('alerts-bell') !== null).toBe(conAlertas);
    expect(quizas('alerts-badge') !== null).toBe(conAlertas);
    expect(api.peticiones.length > 0).toBe(conAlertas);
    if (conAlertas) {
      expect(texto('alerts-badge')).toBe('2');
      expect(consulta(api.listas()[0])).toEqual({ limit: '10' });
    }
  });

  it('sin alertas sin leer no hay badge', async () => {
    await abrir('admin', { alertas: [{ ...ALERTA_OFFLINE, read: true }] });
    expect(quizas('alerts-bell')).toBeTruthy();
    expect(quizas('alerts-badge')).toBeNull();
  });

  it('una alerta resuelta no cuenta en el badge', async () => {
    await abrir('admin', { alertas: [{ ...ALERTA_OFFLINE, resolvedAt: 5000 }, { ...ALERTA_BATERIA }] });
    expect(texto('alerts-badge')).toBe('1');
  });

  it('sondeo: cada 5000 ms repite la consulta y el badge se actualiza', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const api = await abrir();
    const n = api.listas().length;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(api.listas()).toHaveLength(n);
    for (const a of api.alertas) a.read = true;
    await vi.advanceTimersByTimeAsync(1);
    await waitFor(() => expect(api.listas()).toHaveLength(n + 1));
    await waitFor(() => expect(quizas('alerts-badge')).toBeNull());
    expect(consulta(api.listas().at(-1)!)).toEqual({ limit: '10' });
  });

  it('el sondeo no lanza otra consulta mientras la anterior no responde', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let enCurso = 0;
    const api = await abrir('admin', {
      override: (p) => {
        if (p.path !== '/api/v1/alerts' || p.method !== 'GET') return undefined;
        enCurso += 1;
        return enCurso === 1 ? undefined : new Promise<Response>(() => undefined);
      },
    });
    const n = api.listas().length;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(api.listas()).toHaveLength(n + 1);
  });
});

describe('F42 el panel de la campana', () => {
  it('está cerrado al inicio; la campana lo abre y lo cierra', async () => {
    await abrir();
    expect(quizas('alerts-panel')).toBeNull();
    clic('alerts-bell');
    expect(id('alerts-panel')).toBeTruthy();
    clic('alerts-bell');
    expect(quizas('alerts-panel')).toBeNull();
  });

  it('lista las alertas en el orden de la API, con su texto en español y su marca de lectura', async () => {
    await abrir();
    clic('alerts-bell');
    const panel = id('alerts-panel');
    expect(marcadores(panel, 'alert-item')).toEqual(['alert-item-al-1', 'alert-item-al-2', 'alert-item-al-3']);
    expect(id('alert-item-al-1').textContent).toContain(TEXTO_OFFLINE);
    expect(id('alert-item-al-2').textContent).toContain(TEXTO_BATERIA);
    expect(id('alert-item-al-3').textContent).toContain(TEXTO_ANULACION);
    expect(['al-1', 'al-2', 'al-3'].map((a) => id(`alert-item-${a}`).getAttribute('data-read'))).toEqual(['false', 'false', 'true']);
  });

  it('solo las no leídas tienen botón de lectura', async () => {
    await abrir();
    clic('alerts-bell');
    expect(id('alert-read-al-1')).toBeTruthy();
    expect(id('alert-read-al-2')).toBeTruthy();
    expect(quizas('alert-read-al-3')).toBeNull();
  });

  it('marcar una: POST /alerts/:id/read, vuelve a pedir la lista y el badge baja', async () => {
    const api = await abrir();
    clic('alerts-bell');
    const antes = api.listas().length;
    clic('alert-read-al-1');
    await waitFor(() => expect(api.lecturas().map((p) => `${p.method} ${p.path}`)).toEqual(['POST /api/v1/alerts/al-1/read']));
    await waitFor(() => expect(api.listas().length).toBeGreaterThan(antes));
    await waitFor(() => expect(texto('alerts-badge')).toBe('1'));
    expect(id('alert-item-al-1').getAttribute('data-read')).toBe('true');
    expect(quizas('alert-read-al-1')).toBeNull();
  });

  it('marcar todas: POST /alerts/read-all y desaparece el badge', async () => {
    const api = await abrir();
    clic('alerts-bell');
    clic('alerts-read-all');
    await waitFor(() => expect(api.lecturas().map((p) => `${p.method} ${p.path}`)).toEqual(['POST /api/v1/alerts/read-all']));
    await waitFor(() => expect(quizas('alerts-badge')).toBeNull());
    expect(['al-1', 'al-2', 'al-3'].map((a) => id(`alert-item-${a}`).getAttribute('data-read'))).toEqual(['true', 'true', 'true']);
  });

  it('una resuelta lo dice con alerts.resolved', async () => {
    await abrir('admin', { alertas: [{ ...ALERTA_OFFLINE, resolvedAt: 5000 }, { ...ALERTA_BATERIA }] });
    clic('alerts-bell');
    expect(id('alert-item-al-1').textContent).toContain(es['alerts.resolved']);
    expect(id('alert-item-al-2').textContent).not.toContain(es['alerts.resolved']);
  });

  it('«ver todas» abre la sección y cierra el panel', async () => {
    await abrir();
    clic('alerts-bell');
    clic('alerts-view-all');
    expect(await screen.findByTestId('alerts-page')).toBeTruthy();
    expect(quizas('alerts-panel')).toBeNull();
  });

  it('sin alertas muestra alerts-panel-empty', async () => {
    await abrir('admin', { alertas: [] });
    clic('alerts-bell');
    expect(id('alerts-panel-empty')).toBeTruthy();
    expect(quizas('alerts-badge')).toBeNull();
  });

  it('un fallo de la API se ve como alerts-panel-error y no deja badge', async () => {
    await abrir('admin', { override: (p) => (p.path === '/api/v1/alerts' ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    expect(quizas('alerts-badge')).toBeNull();
    clic('alerts-bell');
    expect(texto('alerts-panel-error')).toBe(es['error.INTERNAL_ERROR']);
  });

  it('al cambiar a inglés cambian los textos de las alertas', async () => {
    await abrir();
    clic('alerts-bell');
    fireEvent.change(id('lang-select'), { target: { value: 'en' } });
    await waitFor(() => expect(id('alert-item-al-1').textContent).toContain('Terminal Caja 2 is offline'));
    expect(id('alert-item-al-2').textContent).toContain('Terminal Caja 2 low battery (12%)');
    expect(id('alert-item-al-3').textContent).toContain('Void of receipt F-000009 for $150.000');
    expect(en['alerts.resolved']).not.toBe(es['alerts.resolved']);
  });
});

describe('F43 la sección Alertas', () => {
  it('admin: reemplaza el relleno; liquidaciones lo conserva', async () => {
    await abrirSeccion();
    expect(quizas('placeholder-page')).toBeNull();
    clic('nav-liquidaciones');
    expect(await screen.findByTestId('placeholder-page')).toBeTruthy();
    expect(quizas('alerts-page')).toBeNull();
  });

  it('admin ve las tres pestañas y abre en Alertas', async () => {
    await abrirSeccion();
    expect(id('alerts-tab-alerts').getAttribute('aria-selected')).toBe('true');
    expect(id('alerts-tab-thresholds').getAttribute('aria-selected')).toBe('false');
    expect(id('alerts-tab-audit').getAttribute('aria-selected')).toBe('false');
  });

  it('supervisor: sin pestaña Auditoría y sin pedir /audit', async () => {
    const api = await abrirSeccion('supervisor');
    expect(id('alerts-tab-alerts')).toBeTruthy();
    expect(id('alerts-tab-thresholds')).toBeTruthy();
    expect(quizas('alerts-tab-audit')).toBeNull();
    clic('alerts-tab-thresholds');
    await screen.findByTestId('alert-battery');
    expect(api.deAuditoria()).toHaveLength(0);
  });
});

describe('F44 pestaña Alertas', () => {
  it('pide GET /alerts?limit=50 y pinta cada fila con su texto y su marca de lectura', async () => {
    const api = await abrirSeccion();
    await waitFor(() => expect(api.listas().some((p) => p.query.get('limit') === '50')).toBe(true));
    expect(consulta(api.listas().filter((p) => p.query.get('limit') === '50')[0])).toEqual({ limit: '50' });
    await screen.findByTestId('alerts-row-al-1');
    expect(id('alerts-row-al-1').textContent).toContain(TEXTO_OFFLINE);
    expect(id('alerts-row-al-2').textContent).toContain(TEXTO_BATERIA);
    expect(id('alerts-row-al-3').textContent).toContain(TEXTO_ANULACION);
    expect(['al-1', 'al-2', 'al-3'].map((a) => id(`alerts-row-${a}`).getAttribute('data-read'))).toEqual(['false', 'false', 'true']);
    expect(id('alerts-row-read-al-1')).toBeTruthy();
    expect(quizas('alerts-row-read-al-3')).toBeNull();
  });

  it('«solo no leídas» añade unread=true y quitarlo lo vuelve a quitar', async () => {
    const api = await abrirSeccion();
    await screen.findByTestId('alerts-row-al-3');
    clic('alerts-unread-only');
    await waitFor(() => expect(api.listas().at(-1)?.query.get('unread')).toBe('true'));
    expect(consulta(api.listas().at(-1)!)).toEqual({ limit: '50', unread: 'true' });
    await waitFor(() => expect(quizas('alerts-row-al-3')).toBeNull());
    expect(id('alerts-row-al-1')).toBeTruthy();
    clic('alerts-unread-only');
    await screen.findByTestId('alerts-row-al-3');
    expect(api.listas().at(-1)?.query.get('unread')).toBeNull();
  });

  it('marcar una desde la sección: POST, la fila queda leída y baja el badge de la campana', async () => {
    const api = await abrirSeccion();
    await screen.findByTestId('alerts-row-al-1');
    clic('alerts-row-read-al-1');
    await waitFor(() => expect(api.lecturas().map((p) => p.path)).toEqual(['/api/v1/alerts/al-1/read']));
    await waitFor(() => expect(id('alerts-row-al-1').getAttribute('data-read')).toBe('true'));
    await waitFor(() => expect(texto('alerts-badge')).toBe('1'));
    expect(quizas('alerts-row-read-al-1')).toBeNull();
  });

  it('un fallo al marcar se ve en alerts-action-error y la fila no cambia', async () => {
    await abrirSeccion('admin', { override: (p) => (p.method === 'POST' ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    await screen.findByTestId('alerts-row-al-1');
    clic('alerts-row-read-al-1');
    await waitFor(() => expect(texto('alerts-action-error')).toBe(es['error.INTERNAL_ERROR']));
    expect(id('alerts-row-al-1').getAttribute('data-read')).toBe('false');
  });

  it('sin alertas: alerts-empty', async () => {
    await abrirSeccion('admin', { alertas: [] });
    expect(await screen.findByTestId('alerts-empty')).toBeTruthy();
  });

  it('un 403 de la API se ve como alerts-error', async () => {
    await abrirSeccion('supervisor', {
      override: (p) => (p.path === '/api/v1/alerts' && p.query.get('limit') === '50' ? errorApi(403, 'FORBIDDEN') : undefined),
    });
    expect(await screen.findByTestId('alerts-error')).toBeTruthy();
    expect(texto('alerts-error')).toBe(es['error.FORBIDDEN']);
  });
});

describe('F45 pestaña Umbrales', () => {
  async function abrirUmbrales(role: Role = 'admin', opts: Opts = {}) {
    const api = await abrirSeccion(role, opts);
    clic('alerts-tab-thresholds');
    await screen.findByTestId('alert-battery');
    await waitFor(() => expect((id('alert-battery') as HTMLInputElement).value).not.toBe(''));
    return api;
  }

  it('carga los umbrales de GET /alert-settings en los campos', async () => {
    const api = await abrirUmbrales();
    expect(api.ajustesLeidos()).toHaveLength(1);
    expect((id('alert-battery') as HTMLInputElement).value).toBe('20');
    expect((id('alert-void-amount') as HTMLInputElement).value).toBe('100000');
    expect((id('alert-battery') as HTMLInputElement).disabled).toBe(false);
  });

  it('guardar: PUT con número y texto, aviso de guardado y la campana se reevalúa', async () => {
    const api = await abrirUmbrales();
    expect(texto('alerts-badge')).toBe('2');
    escribir('alert-battery', '10');
    escribir('alert-void-amount', '150000');
    clic('alert-settings-save');
    await waitFor(() => expect(api.ajustesGuardados()).toHaveLength(1));
    const put = api.ajustesGuardados()[0];
    expect(put.contentType).toContain('application/json');
    expect(JSON.parse(put.body ?? '')).toEqual({ batteryBelowPct: 10, voidAtLeastAmount: '150000' });
    expect(await screen.findByTestId('alert-settings-saved')).toBeTruthy();
    expect(quizas('alert-settings-error')).toBeNull();
    // el umbral 10 % deja de cubrir la batería de 12 %: esa alerta se resuelve y el badge baja
    await waitFor(() => expect(texto('alerts-badge')).toBe('1'));
  });

  it.each([
    ['batería 0', '0', '100000'], ['batería 100', '100', '100000'], ['batería decimal', '1.5', '100000'], ['batería texto', 'abc', '100000'],
    ['batería vacía', '', '100000'], ['importe 0', '20', '0'], ['importe negativo', '20', '-5'], ['importe científico', '20', '1e3'],
    ['importe vacío', '20', ''], ['importe de 9 cifras', '20', '123456789'],
  ])('valor inválido (%s): alert-settings-error y no hay PUT', async (_caso, bateria, importe) => {
    const api = await abrirUmbrales();
    escribir('alert-battery', bateria);
    escribir('alert-void-amount', importe);
    clic('alert-settings-save');
    expect(await screen.findByTestId('alert-settings-error')).toBeTruthy();
    expect(texto('alert-settings-error')).toBe(es['alerts.settings.invalid']);
    await pausa();
    expect(api.ajustesGuardados()).toHaveLength(0);
    expect(quizas('alert-settings-saved')).toBeNull();
  });

  it('un 400 de la API se ve como alert-settings-error con su código', async () => {
    await abrirUmbrales('admin', { override: (p) => (p.method === 'PUT' ? errorApi(400, 'VALIDATION_ERROR') : undefined) });
    escribir('alert-battery', '30');
    clic('alert-settings-save');
    await waitFor(() => expect(texto('alert-settings-error')).toBe(es['error.VALIDATION_ERROR']));
    expect(quizas('alert-settings-saved')).toBeNull();
  });

  it('un fallo al cargar los umbrales se ve como alert-settings-error', async () => {
    await abrirSeccion('admin', { override: (p) => (p.path === '/api/v1/alert-settings' ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    clic('alerts-tab-thresholds');
    await waitFor(() => expect(quizas('alert-settings-error')).toBeTruthy());
    expect(texto('alert-settings-error')).toBe(es['error.INTERNAL_ERROR']);
  });

  it('supervisor: ve los valores en campos deshabilitados y no tiene botón de guardar', async () => {
    const api = await abrirUmbrales('supervisor');
    expect((id('alert-battery') as HTMLInputElement).value).toBe('20');
    expect((id('alert-battery') as HTMLInputElement).disabled).toBe(true);
    expect((id('alert-void-amount') as HTMLInputElement).disabled).toBe(true);
    expect(quizas('alert-settings-save')).toBeNull();
    expect(api.ajustesGuardados()).toHaveLength(0);
  });
});
