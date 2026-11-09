// @vitest-environment jsdom
import { SECTIONS } from '@pippos/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { en, es } from '../src/i18n';
import { SECCIONES, mockApi, usuario } from './helpers';

const shell = async () => screen.findByTestId('app-shell');
const text = (testid: string) => screen.getByTestId(testid).textContent;

describe('menú por rol (la API es la única fuente de permisos)', () => {
  for (const role of ['admin', 'supervisor', 'cajero'] as const) {
    it(`${role}: solo ve los enlaces de sus secciones`, async () => {
      mockApi({ me: usuario(role) });
      render(<App />);
      await shell();
      const nav = screen.getByTestId('nav');
      for (const s of SECTIONS) {
        const visible = within(nav).queryByTestId(`nav-${s}`) !== null;
        expect(visible, `${role}/${s}`).toBe(SECCIONES[role].includes(s));
      }
      expect(text('user-name')).toBe(`${role} demo`);
      expect(text('user-role')).toBe(es[`role.${role}`]);
      expect(text('home-merchant')).toBe('Boliche La Noche');
      expect(screen.getByTestId('home-welcome')).toBeTruthy();
      expect(text('demo-banner')).toBe(es['demo.banner']);
    });
  }

  it('si la API da menos secciones de las que el rol «debería» tener, el front respeta la API', async () => {
    mockApi({ me: { ...usuario('admin'), sections: ['inicio', 'alertas'] } });
    render(<App />);
    await shell();
    expect(screen.queryByTestId('nav-usuarios')).toBeNull();
    expect(screen.getByTestId('nav-alertas')).toBeTruthy();
  });

  it('una sección distinta de inicio muestra la página de relleno; inicio vuelve al home', async () => {
    mockApi({ me: usuario('admin') });
    render(<App />);
    await shell();
    fireEvent.click(screen.getByTestId('nav-liquidaciones'));
    expect(await screen.findByTestId('placeholder-page')).toBeTruthy();
    expect(screen.queryByTestId('home-welcome')).toBeNull();
    fireEvent.click(screen.getByTestId('nav-inicio'));
    expect(await screen.findByTestId('home-welcome')).toBeTruthy();
  });
});

describe('B2: idioma y tema', () => {
  it('cambiar a inglés cambia los textos, conserva los data-testid y guarda la preferencia', async () => {
    const { llamadas } = mockApi({ me: usuario('admin') });
    render(<App />);
    await shell();
    const antes = screen.getAllByTestId(/.*/).map((e) => e.getAttribute('data-testid')).sort();
    fireEvent.change(screen.getByTestId('lang-select'), { target: { value: 'en' } });
    await waitFor(() => expect(text('demo-banner')).toBe(en['demo.banner']));
    expect(text('user-role')).toBe(en['role.admin']);
    expect(text('nav-terminales')).toBe(en['nav.terminales']);
    const despues = screen.getAllByTestId(/.*/).map((e) => e.getAttribute('data-testid')).sort();
    expect(despues).toEqual(antes);
    const put = llamadas.filter((l) => l.method === 'PUT' && l.path === '/api/v1/me/preferences');
    expect(put.at(-1)?.body).toEqual({ language: 'en', theme: 'light' });
  });

  it('el botón de tema pone data-theme en <html>, aria-pressed y guarda la preferencia', async () => {
    const { llamadas } = mockApi({ me: usuario('admin') });
    render(<App />);
    await shell();
    const btn = screen.getByTestId('theme-toggle');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(llamadas.filter((l) => l.method === 'PUT').at(-1)?.body).toEqual({ language: 'es', theme: 'dark' });
    fireEvent.click(btn);
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'));
  });

  it('al cargar con sesión manda me.preferences (en + dark) sobre localStorage', async () => {
    localStorage.setItem('pippos.language', 'es');
    mockApi({ me: usuario('cajero', { language: 'en', theme: 'dark' }) });
    render(<App />);
    await shell();
    expect(text('demo-banner')).toBe(en['demo.banner']);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect((screen.getByTestId('lang-select') as HTMLSelectElement).value).toBe('en');
  });

  it('el login (sin sesión) también usa el idioma por defecto es y cambiar idioma allí no llama a la API de preferencias', async () => {
    const { llamadas } = mockApi({ me: null });
    render(<App />);
    expect((await screen.findByTestId('login-form')).textContent).toContain(es['login.submit']);
    expect(llamadas.some((l) => l.method === 'PUT')).toBe(false);
  });
});

describe('cerrar sesión', () => {
  it('logout llama a la API y vuelve al login', async () => {
    const { llamadas } = mockApi({ me: usuario('supervisor') });
    render(<App />);
    await shell();
    fireEvent.click(screen.getByTestId('logout-button'));
    expect(await screen.findByTestId('login-form')).toBeTruthy();
    expect(screen.queryByTestId('app-shell')).toBeNull();
    expect(llamadas.some((l) => l.method === 'POST' && l.path === '/api/v1/auth/logout')).toBe(true);
  });
});
