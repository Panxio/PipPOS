// @vitest-environment jsdom
import type { Role } from '@pippos/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { es } from '../src/i18n';
import { mockCobroApi, tx } from './cobro-mock';
import { errorApi } from './terminales-mock';

const id = (testid: string) => screen.getByTestId(testid);
const quizas = (testid: string) => screen.queryByTestId(testid);
const texto = (testid: string) => id(testid).textContent ?? '';
const escribir = (testid: string, value: string) => fireEvent.change(id(testid), { target: { value } });
const clic = (testid: string) => fireEvent.click(id(testid));
const deshabilitado = (testid: string) => (id(testid) as HTMLButtonElement).disabled;
const valor = (testid: string) => (id(testid) as HTMLInputElement).value;
const cuerpo = (p: { body: string | undefined } | undefined) => JSON.parse(p?.body ?? 'null') as Record<string, unknown>;
const irA = (ruta: string) => window.history.pushState({}, '', ruta);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

afterEach(() => {
  irA('/');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Opts = Parameters<typeof mockCobroApi>[1];

async function abrir(role: Role = 'admin', opts: Opts = {}) {
  const api = mockCobroApi(role, opts);
  render(<App />);
  fireEvent.click(await screen.findByTestId('nav-transacciones'));
  await screen.findByTestId('transactions-page');
  await waitFor(() => expect(within(id('charge-terminal')).getAllByRole('option').length).toBeGreaterThan(1));
  await waitFor(() => expect(screen.queryAllByTestId(/^tx-(row-\d+|empty|error)$/).length).toBeGreaterThan(0));
  return api;
}

function llenar(terminal = 't-1', monto = '2500', last4 = '1111') {
  escribir('charge-terminal', terminal);
  escribir('charge-amount', monto);
  escribir('charge-last4', last4);
}

async function cobrar(last4 = '1111') {
  llenar('t-1', '2500', last4);
  clic('charge-submit');
  await screen.findByTestId('charge-result');
}

const filas = () => within(id('tx-table')).getAllByTestId(/^tx-row-/).map((f) => f.getAttribute('data-testid'));
const veinticinco = () => Array.from({ length: 25 }, (_, i) => tx(i + 1));

describe('F21 la sección Transacciones', () => {
  it.each(['admin', 'supervisor', 'cajero'] as const)('%s: reemplaza el relleno y pide terminales y primera página del feed', async (role) => {
    const { hechas, listas } = await abrir(role);
    expect(quizas('placeholder-page')).toBeNull();
    const terminales = hechas('GET', '/api/v1/terminals');
    expect(terminales).toHaveLength(1);
    expect(Object.fromEntries(terminales[0].query)).toEqual({ pageSize: '100', sort: 'alias', order: 'asc', page: '1' });
    expect(Object.fromEntries(listas()[0].query)).toEqual({ page: '1', pageSize: '20' });
  });
});

describe('F22 formulario de cobro', () => {
  it('ofrece solo terminales activos (valor = id, texto = alias) y arranca con tarjeta y Visa', async () => {
    await abrir();
    const opciones = within(id('charge-terminal')).getAllByRole('option') as HTMLOptionElement[];
    expect(opciones.map((o) => o.value)).toEqual(['', 't-1', 't-2']);
    expect(opciones.slice(1).map((o) => o.textContent)).toEqual(['Caja 1', 'Caja 2']);
    expect(valor('charge-terminal')).toBe('');
    expect(valor('charge-method')).toBe('card');
    expect(valor('charge-brand')).toBe('visa');
  });

  it('el botón solo se habilita con terminal, monto 1…99 999 999 sin ceros a la izquierda y last4 de 4 dígitos', async () => {
    await abrir();
    expect(deshabilitado('charge-submit')).toBe(true);
    escribir('charge-terminal', 't-1');
    escribir('charge-last4', '1111');
    for (const malo of ['', '0', '012', '100000000', 'abc', '12.5']) {
      escribir('charge-amount', malo);
      expect(deshabilitado('charge-submit'), `monto «${malo}»`).toBe(true);
    }
    escribir('charge-amount', '99999999');
    expect(deshabilitado('charge-submit')).toBe(false);
    for (const malo of ['', '111', 'abcd', '11111']) {
      escribir('charge-last4', malo);
      expect(deshabilitado('charge-submit'), `last4 «${malo}»`).toBe(true);
    }
    escribir('charge-last4', '1111');
    escribir('charge-terminal', '');
    expect(deshabilitado('charge-submit')).toBe(true);
  });

  it('envía POST /transactions con exactamente los seis campos, tal como se escribieron', async () => {
    const { cobros } = await abrir();
    escribir('charge-method', 'wallet');
    escribir('charge-brand', 'amex');
    llenar('t-2', '2500', '0042');
    clic('charge-submit');
    await screen.findByTestId('charge-result');
    expect(cobros()).toHaveLength(1);
    expect(cobros()[0].contentType).toBe('application/json');
    const enviado = cuerpo(cobros()[0]);
    expect(enviado.requestId).toMatch(UUID);
    expect({ ...enviado, requestId: 'x' }).toEqual({ requestId: 'x', terminalId: 't-2', amount: '2500', method: 'wallet', brand: 'amex', last4: '0042' });
  });

  it('un doble clic envía UNA sola petición', async () => {
    const { cobros } = await abrir();
    llenar();
    clic('charge-submit');
    clic('charge-submit');
    await screen.findByTestId('charge-result');
    expect(cobros()).toHaveLength(1);
  });
});

describe('F23 requestId', () => {
  it('se reutiliza al reintentar sin tocar nada; cambia al editar un campo y tras «nuevo cobro»', async () => {
    let fallos = 2;
    const { cobros } = await abrir('admin', { override: (p) => (p.method === 'POST' && p.path === '/api/v1/transactions' && fallos-- > 0 ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    llenar();
    clic('charge-submit');
    await screen.findByTestId('charge-error');
    clic('charge-submit');
    await waitFor(() => expect(cobros()).toHaveLength(2));
    await waitFor(() => expect(deshabilitado('charge-submit')).toBe(false));
    const [a, b] = cobros().map((c) => cuerpo(c).requestId);
    expect(a).toMatch(UUID);
    expect(b).toBe(a);
    escribir('charge-amount', '2600');
    clic('charge-submit');
    await screen.findByTestId('charge-result');
    const c = cuerpo(cobros()[2]).requestId;
    expect(c).toMatch(UUID);
    expect(c).not.toBe(a);
    clic('charge-new');
    llenar();
    clic('charge-submit');
    await waitFor(() => expect(cobros()).toHaveLength(4));
    const d = cuerpo(cobros()[3]).requestId;
    expect([d, c].every((v) => typeof v === 'string') && d !== c && d !== a).toBe(true);
  });
});

describe('F24 resultado del cobro', () => {
  it('aprobado: reemplaza el formulario por el resultado con folio y código de autorización', async () => {
    await abrir();
    await cobrar('1111');
    expect(quizas('charge-form')).toBeNull();
    expect(texto('charge-result-status')).toBe(es['tx.status.approved']);
    expect(texto('charge-result-folio')).toBe('1');
    expect(texto('charge-result-code')).toBe('00');
    expect(texto('charge-result-auth')).toBe('654321');
    expect(quizas('charge-error')).toBeNull();
  });

  it('rechazado (0051) y timeout (0408) son resultados, no errores', async () => {
    await abrir();
    await cobrar('0051');
    expect(texto('charge-result-status')).toBe(es['tx.status.declined']);
    expect(texto('charge-result-code')).toBe('51');
    expect(texto('charge-result-auth')).toBe('');
    clic('charge-new');
    await cobrar('0408');
    expect(texto('charge-result-status')).toBe(es['tx.status.timeout']);
    expect(texto('charge-result-code')).toBe('');
    expect(quizas('charge-error')).toBeNull();
  });

  it('«nuevo cobro» vuelve a un formulario vacío', async () => {
    await abrir();
    await cobrar();
    clic('charge-new');
    expect(quizas('charge-result')).toBeNull();
    expect([valor('charge-terminal'), valor('charge-amount'), valor('charge-last4')]).toEqual(['', '', '']);
    expect(deshabilitado('charge-submit')).toBe(true);
  });

  it('un fallo HTTP muestra el texto del código y conserva lo escrito', async () => {
    await abrir('admin', { override: (p) => (p.method === 'POST' ? errorApi(404, 'NOT_FOUND') : undefined) });
    llenar('t-2', '3300', '4242');
    clic('charge-submit');
    expect((await screen.findByTestId('charge-error')).textContent).toBe(es['error.NOT_FOUND']);
    expect(quizas('charge-result')).toBeNull();
    expect([valor('charge-terminal'), valor('charge-amount'), valor('charge-last4')]).toEqual(['t-2', '3300', '4242']);
  });

  it('tras cobrar, el feed se recarga al tiro y muestra la fila nueva', async () => {
    const { listas } = await abrir();
    const antes = listas().length;
    await cobrar();
    await screen.findByTestId('tx-row-1');
    expect(listas().length).toBeGreaterThan(antes);
  });
});

describe('F25 feed y sondeo', () => {
  const datos = () => [
    tx(1, { createdAt: 3_000 }),
    tx(2, { createdAt: 2_000, amount: '1234567', method: 'wallet', brand: 'mastercard', last4: '4242', status: 'declined', terminalId: 't-2' }),
    tx(3, { createdAt: 1_000, terminalId: 't-99' }),
  ];

  it('pinta las filas en el orden de la API con alias, importe, medio, marca, last4 y estado', async () => {
    await abrir('admin', { txs: datos() });
    expect(filas()).toEqual(['tx-row-1', 'tx-row-2', 'tx-row-3']);
    const fila = texto('tx-row-2');
    for (const parte of ['2', 'Caja 2', '$1.234.567', es['tx.method.wallet'], es['tx.brand.mastercard'], '4242', es['tx.status.declined']]) expect(fila).toContain(parte);
    expect(texto('tx-row-1')).toContain('$1.000');
    expect(texto('tx-row-3')).not.toContain('undefined');
    expect(texto('tx-total')).toBe('3');
  });

  it('vacío → tx-empty; un fallo de la lista → tx-error con el texto del código', async () => {
    await abrir('admin');
    expect(id('tx-empty')).toBeTruthy();
    cleanup();
    mockCobroApi('admin', { override: (p) => (p.method === 'GET' && p.path === '/api/v1/transactions' ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    render(<App />);
    fireEvent.click(await screen.findByTestId('nav-transacciones'));
    expect((await screen.findByTestId('tx-error')).textContent).toBe(es['error.INTERNAL_ERROR']);
  });

  it('paginación: «1 / 2», siguiente pide page=2 y anterior vuelve', async () => {
    const { listas } = await abrir('admin', { txs: veinticinco() });
    expect(texto('tx-page-info')).toBe('1 / 2');
    expect(deshabilitado('tx-prev')).toBe(true);
    clic('tx-next');
    await waitFor(() => expect(texto('tx-page-info')).toBe('2 / 2'));
    expect(listas().at(-1)?.query.get('page')).toBe('2');
    expect(deshabilitado('tx-next')).toBe(true);
    clic('tx-prev');
    await waitFor(() => expect(texto('tx-page-info')).toBe('1 / 2'));
  });

  it('sondeo: cada 5000 ms repite la última consulta, trae filas nuevas y no vacía la tabla', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { listas, txs } = await abrir('admin', { txs: [tx(1)] });
    const n = listas().length;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(listas()).toHaveLength(n);
    txs.push(tx(2, { createdAt: 5_000_000 }));
    await vi.advanceTimersByTimeAsync(1);
    await screen.findByTestId('tx-row-2');
    expect(listas()).toHaveLength(n + 1);
    expect(listas().at(-1)?.query.toString()).toBe(listas()[0].query.toString());
    expect(quizas('tx-empty')).toBeNull();
    expect(filas()).toEqual(['tx-row-2', 'tx-row-1']);
  });

  it('el sondeo respeta filtros y página, no se solapa con una petición en curso y para al salir de la sección', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let colgar = false;
    const { listas } = await abrir('admin', {
      txs: veinticinco(),
      override: (p) => (colgar && p.method === 'GET' && p.path === '/api/v1/transactions' ? new Promise<Response>(() => undefined) : undefined),
    });
    clic('tx-next');
    await waitFor(() => expect(texto('tx-page-info')).toBe('2 / 2'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(listas().at(-1)?.query.get('page')).toBe('2');
    colgar = true;
    await vi.advanceTimersByTimeAsync(5_000);
    const n = listas().length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(listas()).toHaveLength(n);
    expect(quizas('tx-table')).not.toBeNull();
    colgar = false;
    clic('nav-inicio');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(listas()).toHaveLength(n);
  });

  it('si el sondeo falla conserva la tabla y muestra tx-error; al recuperarse lo quita', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let falla = false;
    await abrir('admin', {
      txs: datos(),
      override: (p) => (falla && p.method === 'GET' && p.path === '/api/v1/transactions' ? errorApi(500, 'INTERNAL_ERROR') : undefined),
    });
    falla = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await screen.findByTestId('tx-error')).textContent).toBe(es['error.INTERNAL_ERROR']);
    expect(filas()).toHaveLength(3);
    falla = false;
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(quizas('tx-error')).toBeNull());
    expect(filas()).toHaveLength(3);
  });
});

describe('F26 filtros', () => {
  const ultima = (listas: () => { query: URLSearchParams }[]) => Object.fromEntries(listas().at(-1)?.query ?? []);

  it('select de estado, medio, marca y terminal mandan sus parámetros y vuelven a la página 1', async () => {
    const { listas } = await abrir('admin', { txs: veinticinco() });
    clic('tx-next');
    await waitFor(() => expect(texto('tx-page-info')).toBe('2 / 2'));
    escribir('tx-filter-status', 'declined');
    await waitFor(() => expect(ultima(listas).status).toBe('declined'));
    expect(ultima(listas).page).toBe('1');
    escribir('tx-filter-method', 'wallet');
    escribir('tx-filter-brand', 'amex');
    escribir('tx-filter-terminal', 't-2');
    await waitFor(() => expect(ultima(listas)).toMatchObject({ status: 'declined', method: 'wallet', brand: 'amex', terminalId: 't-2', page: '1', pageSize: '20' }));
    escribir('tx-filter-status', '');
    await waitFor(() => expect(ultima(listas).status).toBeUndefined());
  });

  it('el filtro de terminal ofrece todos los terminales (también el inactivo); el de cobro, solo los activos', async () => {
    await abrir();
    const valores = (within(id('tx-filter-terminal')).getAllByRole('option') as HTMLOptionElement[]).map((o) => o.value);
    expect(valores).toEqual(['', 't-1', 't-2', 't-3']);
  });

  it('desde/hasta se envían en ms locales (00:00:00.000 y 23:59:59.999)', async () => {
    const { listas } = await abrir();
    escribir('tx-filter-from', '2026-03-05');
    escribir('tx-filter-to', '2026-03-06');
    await waitFor(() => expect(ultima(listas)).toMatchObject({
      from: String(new Date(2026, 2, 5, 0, 0, 0, 0).getTime()),
      to: String(new Date(2026, 2, 6, 23, 59, 59, 999).getTime()),
    }));
  });

  it('min y max solo se envían si son un monto válido', async () => {
    const { listas } = await abrir();
    escribir('tx-filter-min', 'abc');
    escribir('tx-filter-max', '0');
    await waitFor(() => expect(listas().length).toBeGreaterThan(0));
    expect(ultima(listas).min).toBeUndefined();
    expect(ultima(listas).max).toBeUndefined();
    escribir('tx-filter-min', '1500');
    escribir('tx-filter-max', '9000');
    await waitFor(() => expect(ultima(listas)).toMatchObject({ min: '1500', max: '9000' }));
  });
});

describe('F27 detalle', () => {
  const datos = () => [
    tx(1, { amount: '5000', brand: 'amex', method: 'wallet', last4: '0042', terminalId: 't-2', events: [
      { kind: 'created', amount: '5000', at: 1, byUserId: 'user-cajero' }, { kind: 'refunded', amount: '1000', at: 2, byUserId: 'user-admin' }], refundedAmount: '1000', status: 'partially_refunded' }),
    tx(2, { status: 'declined', responseCode: '51', authCode: null }),
    tx(3, { status: 'timeout', responseCode: null, authCode: null }),
  ];

  it('abre el panel con los campos, los eventos y el enlace al comprobante en pestaña nueva', async () => {
    const { hechas } = await abrir('admin', { txs: datos() });
    clic('tx-open-1');
    await screen.findByTestId('tx-detail');
    await waitFor(() => expect(texto('tx-detail-folio')).toBe('1'));
    expect(hechas('GET', '/api/v1/transactions/tx-1')).toHaveLength(1);
    expect(texto('tx-detail-status')).toBe(es['tx.status.partially_refunded']);
    expect(texto('tx-detail-terminal')).toBe('Caja 2');
    expect(texto('tx-detail-amount')).toBe('$5.000');
    expect(texto('tx-detail-refunded')).toBe('$1.000');
    expect(texto('tx-detail-method')).toBe(es['tx.method.wallet']);
    expect(texto('tx-detail-brand')).toBe(es['tx.brand.amex']);
    expect(texto('tx-detail-last4')).toBe('0042');
    expect(texto('tx-detail-auth')).toBe('A12345');
    const eventos = screen.getAllByTestId('tx-event').map((e) => e.textContent ?? '');
    expect(eventos).toHaveLength(2);
    expect(eventos[0]).toContain(es['tx.event.created']);
    expect(eventos[1]).toContain(es['tx.event.refunded']);
    expect(eventos[1]).toContain('$1.000');
    const enlace = id('tx-receipt-link');
    expect(enlace.getAttribute('href')).toBe('/comprobante/tx-1');
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toContain('noopener');
    clic('tx-detail-close');
    expect(quizas('tx-detail')).toBeNull();
  });

  it('rechazada y sin respuesta no tienen comprobante', async () => {
    await abrir('admin', { txs: datos() });
    for (const folio of [2, 3]) {
      clic(`tx-open-${folio}`);
      await waitFor(() => expect(texto('tx-detail-folio')).toBe(String(folio)));
      expect(quizas('tx-receipt-link')).toBeNull();
    }
  });

  it('un fallo del detalle se muestra con el texto del código', async () => {
    await abrir('admin', { txs: datos(), override: (p) => (p.path === '/api/v1/transactions/tx-1' ? errorApi(404, 'NOT_FOUND') : undefined) });
    clic('tx-open-1');
    expect((await screen.findByTestId('tx-detail-error')).textContent).toBe(es['error.NOT_FOUND']);
  });
});

describe('F28 anular y devolver', () => {
  const abrirDetalle = async (role: Role, folio: number, txs = [tx(1, { amount: '5000' })]) => {
    const api = await abrir(role, { txs });
    clic(`tx-open-${folio}`);
    await waitFor(() => expect(texto('tx-detail-folio')).toBe(String(folio)));
    return api;
  };

  it('anular pide confirmación; cancelar no envía; aceptar hace POST void con cuerpo {} y refresca detalle y feed', async () => {
    const { hechas } = await abrirDetalle('admin', 1);
    clic('tx-void');
    expect(id('tx-confirm')).toBeTruthy();
    expect(hechas('POST', '/api/v1/transactions/tx-1/void')).toHaveLength(0);
    clic('tx-confirm-cancel');
    expect(quizas('tx-confirm')).toBeNull();
    expect(hechas('POST', '/api/v1/transactions/tx-1/void')).toHaveLength(0);
    clic('tx-void');
    clic('tx-confirm-accept');
    await waitFor(() => expect(texto('tx-detail-status')).toBe(es['tx.status.voided']));
    expect(cuerpo(hechas('POST', '/api/v1/transactions/tx-1/void')[0])).toEqual({});
    expect(screen.getAllByTestId('tx-event')).toHaveLength(2);
    expect(quizas('tx-void')).toBeNull();
    expect(quizas('tx-refund-amount')).toBeNull();
    await waitFor(() => expect(texto('tx-row-1')).toContain(es['tx.status.voided']));
    expect(quizas('tx-confirm')).toBeNull();
  });

  it('devolución: el botón exige un monto válido; parcial y luego total actualizan estado y montos', async () => {
    const { hechas } = await abrirDetalle('supervisor', 1);
    expect(deshabilitado('tx-refund-submit')).toBe(true);
    for (const malo of ['0', '012', 'abc', '100000000']) {
      escribir('tx-refund-amount', malo);
      expect(deshabilitado('tx-refund-submit'), malo).toBe(true);
    }
    escribir('tx-refund-amount', '1000');
    clic('tx-refund-submit');
    await waitFor(() => expect(texto('tx-detail-status')).toBe(es['tx.status.partially_refunded']));
    expect(cuerpo(hechas('POST', '/api/v1/transactions/tx-1/refund')[0])).toEqual({ amount: '1000' });
    expect(texto('tx-detail-refunded')).toBe('$1.000');
    expect(valor('tx-refund-amount')).toBe('');
    expect(quizas('tx-void')).toBeNull();
    await waitFor(() => expect(texto('tx-row-1')).toContain(es['tx.status.partially_refunded']));
    escribir('tx-refund-amount', '4000');
    clic('tx-refund-submit');
    await waitFor(() => expect(texto('tx-detail-status')).toBe(es['tx.status.refunded']));
    expect(texto('tx-detail-refunded')).toBe('$5.000');
    expect(quizas('tx-refund-amount')).toBeNull();
    expect(quizas('tx-void')).toBeNull();
  });

  it('un 409 de la API se muestra en el detalle, que sigue abierto con sus acciones', async () => {
    await abrir('admin', { txs: [tx(1)], override: (p) => (p.method === 'POST' && p.path.endsWith('/void') ? errorApi(409, 'CONFLICT') : undefined) });
    clic('tx-open-1');
    await waitFor(() => expect(texto('tx-detail-folio')).toBe('1'));
    clic('tx-void');
    clic('tx-confirm-accept');
    expect((await screen.findByTestId('tx-detail-error')).textContent).toBe(es['error.CONFLICT']);
    expect(id('tx-detail')).toBeTruthy();
    expect(texto('tx-detail-status')).toBe(es['tx.status.approved']);
    expect(id('tx-void')).toBeTruthy();
  });

  it('con devoluciones previas no se ofrece anular; declinadas y anuladas no ofrecen nada', async () => {
    await abrir('admin', { txs: [tx(1, { refundedAmount: '500', status: 'partially_refunded' }), tx(2, { status: 'declined' }), tx(3, { status: 'voided' })] });
    clic('tx-open-1');
    await waitFor(() => expect(texto('tx-detail-folio')).toBe('1'));
    expect(quizas('tx-void')).toBeNull();
    expect(id('tx-refund-amount')).toBeTruthy();
    for (const folio of [2, 3]) {
      clic(`tx-open-${folio}`);
      await waitFor(() => expect(texto('tx-detail-folio')).toBe(String(folio)));
      expect(quizas('tx-void')).toBeNull();
      expect(quizas('tx-refund-amount')).toBeNull();
    }
  });

  it('el cajero ve el detalle pero ningún control de anular ni devolver; el supervisor sí', async () => {
    await abrirDetalle('cajero', 1);
    expect(id('tx-receipt-link')).toBeTruthy();
    for (const nodo of ['tx-void', 'tx-refund-amount', 'tx-refund-submit']) expect(quizas(nodo), nodo).toBeNull();
    cleanup();
    await abrirDetalle('supervisor', 1);
    expect(id('tx-void')).toBeTruthy();
    expect(id('tx-refund-amount')).toBeTruthy();
  });
});

describe('F29 comprobante', () => {
  const abrirComprobante = async (opts: Opts = {}) => {
    mockCobroApi('admin', { txs: [tx(7, { amount: '1234567', refundedAmount: '1000', status: 'partially_refunded', last4: '0042', brand: 'mastercard', method: 'wallet' })], ...opts });
    irA('/comprobante/tx-7');
    render(<App />);
  };

  it('muestra los campos del comprobante, sin barra de la app, y imprime con window.print', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    await abrirComprobante();
    await screen.findByTestId('receipt-page');
    await waitFor(() => expect(texto('receipt-folio')).toBe('7'));
    expect(quizas('app-shell')).toBeNull();
    expect(texto('receipt-merchant')).toBe('Boliche La Noche');
    expect(texto('receipt-terminal')).toBe('Caja 1');
    expect(texto('receipt-amount')).toBe('$1.234.567');
    expect(texto('receipt-refunded')).toBe('$1.000');
    expect(texto('receipt-method')).toBe(es['tx.method.wallet']);
    expect(texto('receipt-brand')).toBe(es['tx.brand.mastercard']);
    expect(texto('receipt-last4')).toBe('0042');
    expect(texto('receipt-status')).toBe(es['tx.status.partially_refunded']);
    expect(texto('receipt-auth')).toBe('A12345');
    expect(texto('receipt-date')).not.toBe('');
    clic('receipt-print');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('un fallo se muestra con el texto del código', async () => {
    await abrirComprobante({ override: (p) => (p.path.endsWith('/receipt') ? errorApi(409, 'CONFLICT') : undefined) });
    expect((await screen.findByTestId('receipt-error')).textContent).toBe(es['error.CONFLICT']);
  });
});
