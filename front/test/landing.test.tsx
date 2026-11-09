// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { en, es } from '../src/i18n';
import { mockApi, usuario } from './helpers';

// L1-L5: la landing vive en `/`; el login, en `/ingresar`. `setup.ts` fija `/ingresar` antes de cada test.
const irA = (ruta: string) => window.history.pushState({}, '', ruta);
const id = (x: string) => screen.findByTestId(x);
const quizas = (x: string) => screen.queryByTestId(x);
const clic = (x: string) => fireEvent.click(screen.getByTestId(x));
const abierto = (boton: string) => screen.getByTestId(boton).getAttribute('aria-expanded');

async function landing() {
  mockApi({ me: null });
  irA('/');
  render(<App />);
  await id('landing');
}

describe('L1 rutas', () => {
  it('sin sesión, `/` muestra la landing y no el login ni la app', async () => {
    await landing();
    expect(quizas('login-form')).toBeNull();
    expect(quizas('app-shell')).toBeNull();
  });

  it('sin sesión, `/ingresar` muestra el login y no la landing', async () => {
    mockApi({ me: null });
    irA('/ingresar');
    render(<App />);
    expect(await id('login-form')).toBeTruthy();
    expect(quizas('landing')).toBeNull();
  });

  it('con sesión, `/` muestra la app y no la landing', async () => {
    mockApi({ me: usuario('admin') });
    irA('/');
    render(<App />);
    expect(await id('app-shell')).toBeTruthy();
    expect(quizas('landing')).toBeNull();
  });

  it('los tres CTA de entrada apuntan a /ingresar y navegan sin recargar', async () => {
    for (const cta of ['landing-cta-bar', 'landing-cta-login', 'landing-cta-final']) {
      await landing();
      expect(screen.getByTestId(cta).getAttribute('href'), cta).toBe('/ingresar');
      clic(cta);
      expect(await id('login-form')).toBeTruthy();
      expect(window.location.pathname).toBe('/ingresar');
      expect(quizas('landing')).toBeNull();
      cleanup();
    }
  });

  it('cerrar sesión lleva al login en /ingresar, no a la landing', async () => {
    mockApi({ me: usuario('admin') });
    irA('/');
    render(<App />);
    await id('app-shell');
    clic('logout-button');
    expect(await id('login-form')).toBeTruthy();
    expect(window.location.pathname).toBe('/ingresar');
  });
});


describe('L2 estructura', () => {
  it('un solo h1, con el título traducido', async () => {
    await landing();
    const h1 = document.querySelectorAll('h1');
    expect(h1.length).toBe(1);
    expect(screen.getByTestId('landing-title').textContent).toBe(es['landing.title']);
    expect(screen.getByTestId('landing-title').tagName).toBe('H1');
  });

  it('la tabla de ejemplo tiene 5 filas y cabeceras con scope', async () => {
    await landing();
    for (const n of [1, 2, 3, 4, 5]) expect(screen.getByTestId(`landing-fila-${n}`).tagName).toBe('TR');
    const tabla = screen.getByTestId('landing-ejemplo').querySelector('table')!;
    expect(tabla.querySelectorAll('th[scope="col"]').length).toBeGreaterThanOrEqual(5);
  });

  it('los enlaces ancla apuntan a ids que existen', async () => {
    await landing();
    const enlaces = [...screen.getByTestId('landing').querySelectorAll('a[href^="#"]')] as HTMLAnchorElement[];
    expect(enlaces.length).toBeGreaterThanOrEqual(8);
    for (const a of enlaces) {
      const destino = a.getAttribute('href')!.slice(1);
      expect(document.getElementById(destino), `#${destino}`).not.toBeNull();
    }
  });

  it('el selector de ejemplo aparece una vez por herramienta', async () => {
    await landing();
    const bloque = screen.getByTestId('landing-selectores');
    for (const herramienta of ['Playwright', 'Cypress', 'Selenium']) expect(within(bloque).getByText(herramienta)).toBeTruthy();
    expect(bloque.querySelectorAll('pre').length).toBe(3);
  });

  it('A2: sin canvas ni shadow DOM; las ondas decorativas son aria-hidden', async () => {
    await landing();
    expect(document.querySelectorAll('canvas').length).toBe(0);
    expect([...document.querySelectorAll('*')].filter((e) => e.shadowRoot !== null).length).toBe(0);
    expect(document.querySelector('.rings')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('hay un enlace de salto al contenido que apunta a un id existente', async () => {
    await landing();
    const salto = screen.getByTestId('landing-skip');
    expect(document.getElementById(salto.getAttribute('href')!.slice(1))).not.toBeNull();
  });
});

describe('L4 menús', () => {
  it('abrir un menú lo muestra; abrir el otro cierra el primero', async () => {
    await landing();
    expect(abierto('landing-menu-producto')).toBe('false');
    expect(screen.getByTestId('landing-menu-producto-lista').hidden).toBe(true);
    clic('landing-menu-producto');
    expect(abierto('landing-menu-producto')).toBe('true');
    expect(screen.getByTestId('landing-menu-producto-lista').hidden).toBe(false);
    clic('landing-menu-automatizacion');
    expect(abierto('landing-menu-automatizacion')).toBe('true');
    expect(abierto('landing-menu-producto')).toBe('false');
    expect(screen.getByTestId('landing-menu-producto-lista').hidden).toBe(true);
  });

  it('el mismo botón alterna; Escape y clic fuera cierran', async () => {
    await landing();
    clic('landing-menu-producto');
    clic('landing-menu-producto');
    expect(abierto('landing-menu-producto')).toBe('false');
    clic('landing-menu-producto');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(abierto('landing-menu-producto')).toBe('false');
    clic('landing-menu-automatizacion');
    fireEvent.click(document.body);
    expect(abierto('landing-menu-automatizacion')).toBe('false');
  });

  it('elegir un enlace del menú lo cierra', async () => {
    await landing();
    clic('landing-menu-producto');
    clic('landing-link-cobros');
    expect(abierto('landing-menu-producto')).toBe('false');
  });

  it('menú móvil: el botón alterna aria-expanded y muestra los destinos', async () => {
    await landing();
    const boton = screen.getByTestId('landing-menu-toggle');
    expect(boton.getAttribute('aria-controls')).toBe(screen.getByTestId('landing-mobile-nav').id);
    expect(abierto('landing-menu-toggle')).toBe('false');
    expect(screen.getByTestId('landing-mobile-nav').hidden).toBe(true);
    clic('landing-menu-toggle');
    expect(abierto('landing-menu-toggle')).toBe('true');
    expect(screen.getByTestId('landing-mobile-nav').hidden).toBe(false);
    for (const d of ['producto', 'automatizacion', 'entrar']) {
      expect(screen.getByTestId(`landing-mobile-link-${d}`).getAttribute('href')).toBe(`#${d}`);
    }
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(abierto('landing-menu-toggle')).toBe('false');
  });
});

describe('L3 idioma', () => {
  it('el selector cambia el texto, el lang del documento y lo guarda para el login', async () => {
    await landing();
    expect(document.documentElement.lang).toBe('es');
    fireEvent.change(screen.getByTestId('landing-lang'), { target: { value: 'en' } });
    await waitFor(() => expect(screen.getByTestId('landing-title').textContent).toBe(en['landing.title']));
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('pippos.language')).toBe('en');
    expect(screen.getByTestId('landing-cta-login').textContent).toBe(en['landing.cta']);
    clic('landing-cta-login');
    await id('login-form');
    expect(document.querySelector('h1')?.textContent).toBe(en['login.title']);
  });

  it('arranca en el idioma guardado', async () => {
    localStorage.setItem('pippos.language', 'en');
    await landing();
    expect(screen.getByTestId('landing-title').textContent).toBe(en['landing.title']);
  });

  it('el texto ES y el EN del título y del CTA son distintos', () => {
    expect(es['landing.title']).not.toBe(en['landing.title']);
    expect(es['landing.cta']).not.toBe(en['landing.cta']);
  });
});
