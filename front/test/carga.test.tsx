// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { mockApi, usuario } from './helpers';
import { crearTerminales } from './terminales-mock';

// C4: mientras la API no responde, cada vista expone su estado de carga por contrato.
// `fetch` responde solo /me; todo lo demás queda pendiente hasta que el test llama a `liberar()`.
function apiPendiente() {
  const base = mockApi({ me: usuario('admin') });
  const pendientes: ((r: Response) => void)[] = [];
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(input), 'http://127.0.0.1:5173').pathname === '/api/v1/me') return base.fn(input, init);
    return new Promise<Response>((resolver) => pendientes.push(resolver));
  }));
  return {
    liberar: (cuerpo: unknown) =>
      pendientes.splice(0).forEach((r) => r(new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'content-type': 'application/json' } }))),
  };
}

const ir = async (seccion: string) => fireEvent.click(await screen.findByTestId(`nav-${seccion}`));

function esperarCarga(testid: string, prefijo: string) {
  const el = screen.getByTestId(testid);
  expect(el.textContent).toBe('Cargando…');
  expect(el.getAttribute('role')).toBe('status');
  expect(el.getAttribute('aria-busy')).toBe('true');
  expect(screen.queryByTestId(`${prefijo}-error`)).toBeNull();
  expect(screen.queryByTestId(`${prefijo}-empty`)).toBeNull();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('C4 · estados de carga con data-testid', () => {
  it.each([
    ['terminales', 'terminals-page', [['terminals-loading', 'terminals']]],
    ['usuarios', 'users-page', [['users-loading', 'users'], ['branches-loading', 'branches'], ['mailbox-loading', 'mailbox']]],
    ['transacciones', 'transactions-page', [['tx-loading', 'tx']]],
    ['alertas', 'alerts-page', [['alerts-loading', 'alerts']]],
  ] as const)('sección %s', async (seccion, pagina, cargas) => {
    apiPendiente();
    render(<App />);
    await ir(seccion);
    await screen.findByTestId(pagina);
    for (const [testid, prefijo] of cargas) esperarCarga(testid, prefijo);
  });

  it('pestaña de auditoría', async () => {
    apiPendiente();
    render(<App />);
    await ir('alertas');
    fireEvent.click(await screen.findByTestId('alerts-tab-audit'));
    esperarCarga('audit-loading', 'audit');
  });

  it('panel de la campana', async () => {
    apiPendiente();
    render(<App />);
    fireEvent.click(await screen.findByTestId('alerts-bell'));
    esperarCarga('alerts-panel-loading', 'alerts-panel');
  });

  it('el estado de carga desaparece al llegar los datos', async () => {
    const api = apiPendiente();
    render(<App />);
    await ir('terminales');
    expect(await screen.findByTestId('terminals-loading')).toBeTruthy();
    api.liberar({ items: crearTerminales(2), total: 2, page: 1, pageSize: 20 });
    await waitFor(() => expect(screen.queryByTestId('terminals-loading')).toBeNull());
    expect(screen.getByTestId('terminals-table')).toBeTruthy();
  });
});
