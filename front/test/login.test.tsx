// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { es } from '../src/i18n';
import { mockApi, usuario } from './helpers';

const id = (x: string) => screen.findByTestId(x);

async function entrar(email: string, password: string) {
  fireEvent.change(await id('login-email'), { target: { value: email } });
  fireEvent.change(screen.getByTestId('login-password'), { target: { value: password } });
  fireEvent.click(screen.getByTestId('login-submit'));
}

describe('acceso', () => {
  it('sin sesión (me → 401) se ve el login y no el shell', async () => {
    mockApi({ me: null });
    render(<App />);
    expect(await id('login-form')).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });

  it('login válido: envía email y clave a la API (mismo origen) y entra al shell', async () => {
    const { llamadas, fn } = mockApi({ me: null, loginUser: usuario('admin') });
    render(<App />);
    await entrar('admin@pippos.test', 'demo-pippos-2026');
    expect(await id('app-shell')).toBeTruthy();
    const login = llamadas.find((l) => l.path === '/api/v1/auth/login');
    expect(login?.method).toBe('POST');
    expect(login?.body).toEqual({ email: 'admin@pippos.test', password: 'demo-pippos-2026' });
    const init = fn.mock.calls.find((c) => String(c[0]).endsWith('/auth/login'))?.[1];
    expect(init?.credentials).toBe('same-origin');
  });

  it('credenciales malas: muestra el texto traducido del código, sin entrar', async () => {
    mockApi({ me: null, loginError: { status: 401, code: 'INVALID_CREDENTIALS' } });
    render(<App />);
    await entrar('admin@pippos.test', 'mala');
    expect((await id('login-error')).textContent).toBe(es['error.INVALID_CREDENTIALS']);
    expect(screen.queryByTestId('app-shell')).toBeNull();
  });

  it('429 muestra el texto de RATE_LIMITED y el error desaparece al reintentar con éxito', async () => {
    mockApi({ me: null, loginError: { status: 429, code: 'RATE_LIMITED' } });
    render(<App />);
    await entrar('admin@pippos.test', 'x');
    expect((await id('login-error')).textContent).toBe(es['error.RATE_LIMITED']);
  });

  it('no muestra la clave cruda ni el código en ningún error', async () => {
    mockApi({ me: null, loginError: { status: 401, code: 'INVALID_CREDENTIALS' } });
    render(<App />);
    await entrar('a@b.cl', 'x');
    const txt = (await id('login-error')).textContent ?? '';
    expect(txt).not.toMatch(/INVALID_CREDENTIALS|error\./);
  });

  it('la sesión existente se restaura al cargar (me → 200)', async () => {
    mockApi({ me: usuario('cajero') });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-shell')).toBeTruthy());
    expect(screen.queryByTestId('login-form')).toBeNull();
  });
});
