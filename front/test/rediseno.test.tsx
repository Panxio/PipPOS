// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { en, es } from '../src/i18n';
import { mockApi, usuario } from './helpers';

// U2, U3: barra con menús agrupados y login con ondas.
const GRUPOS = {
  operacion: ['terminales', 'transacciones'],
  analisis: ['reportes', 'alertas'],
  admin: ['usuarios', 'liquidaciones'],
} as const;
type Grupo = keyof typeof GRUPOS;
const NOMBRES: Grupo[] = ['operacion', 'analisis', 'admin'];

const el = (x: string) => screen.getByTestId(x);
const quizas = (x: string) => screen.queryByTestId(x);
const abierto = (g: Grupo) => el(`nav-group-${g}`).getAttribute('aria-expanded');
const clic = (x: string) => fireEvent.click(el(x));

async function entrar(role: 'admin' | 'supervisor' | 'cajero') {
  mockApi({ me: usuario(role) });
  render(<App />);
  await screen.findByTestId('app-shell');
}

describe('U2 estructura de la barra', () => {
  it('admin: inicio directo y tres grupos, en orden, con sus secciones dentro de cada lista', async () => {
    await entrar('admin');
    const nav = el('nav');
    const ids = within(nav).getAllByTestId(/^nav-/).map((e) => e.getAttribute('data-testid'));
    expect(ids).toEqual([
      'nav-inicio',
      'nav-group-operacion', 'nav-group-operacion-list', 'nav-terminales', 'nav-transacciones',
      'nav-group-analisis', 'nav-group-analisis-list', 'nav-reportes', 'nav-alertas',
      'nav-group-admin', 'nav-group-admin-list', 'nav-usuarios', 'nav-liquidaciones',
    ]);
    expect(el('nav-inicio').closest('[data-testid$="-list"]')).toBeNull();
    for (const g of NOMBRES) {
      const lista = el(`nav-group-${g}-list`);
      for (const s of GRUPOS[g]) expect(within(lista).getByTestId(`nav-${s}`), `${g}/${s}`).toBeTruthy();
    }
  });

  it('cada grupo es un botón cerrado de origen: aria-expanded=false, aria-controls a su lista y lista hidden', async () => {
    await entrar('admin');
    for (const g of NOMBRES) {
      const boton = el(`nav-group-${g}`);
      const lista = el(`nav-group-${g}-list`);
      expect(boton.tagName, g).toBe('BUTTON');
      expect(boton.getAttribute('type'), g).toBe('button');
      expect(abierto(g), g).toBe('false');
      expect(lista.id, g).not.toBe('');
      expect(boton.getAttribute('aria-controls'), g).toBe(lista.id);
      expect(lista.hasAttribute('hidden'), g).toBe(true);
    }
  });

  it('supervisor no tiene el grupo Administración; cajero solo Operación con Transacciones', async () => {
    await entrar('supervisor');
    expect(quizas('nav-group-admin')).toBeNull();
    expect(quizas('nav-group-admin-list')).toBeNull();
    expect(within(el('nav-group-operacion-list')).getAllByTestId(/^nav-/)).toHaveLength(2);
    expect(within(el('nav-group-analisis-list')).getAllByTestId(/^nav-/)).toHaveLength(2);
  });

  it('cajero: inicio + Operación → solo transacciones; sin Análisis ni Administración', async () => {
    await entrar('cajero');
    expect(quizas('nav-group-analisis')).toBeNull();
    expect(quizas('nav-group-admin')).toBeNull();
    const dentro = within(el('nav-group-operacion-list')).getAllByTestId(/^nav-/).map((e) => e.getAttribute('data-testid'));
    expect(dentro).toEqual(['nav-transacciones']);
    expect(quizas('nav-terminales')).toBeNull();
  });

  it('los textos de los grupos salen del catálogo y cambian con el idioma, sin tocar los ids', async () => {
    await entrar('admin');
    expect(es['nav.group.operacion']).toBe('Operación');
    expect(es['nav.group.analisis']).toBe('Análisis');
    expect(es['nav.group.admin']).toBe('Administración');
    expect([en['nav.group.operacion'], en['nav.group.analisis'], en['nav.group.admin']]).toEqual(['Operations', 'Analysis', 'Administration']);
    expect(el('nav-group-analisis').textContent).toContain(es['nav.group.analisis']);
    fireEvent.change(el('lang-select'), { target: { value: 'en' } });
    await screen.findByText('Analysis');
    expect(el('nav-group-analisis').textContent).toContain('Analysis');
    expect(el('nav-reportes').textContent).toBe(en['nav.reportes']);
  });
});

describe('U2 comportamiento de los menús', () => {
  it('clic abre la lista; otro grupo cierra el anterior; clic en el mismo lo cierra', async () => {
    await entrar('admin');
    clic('nav-group-operacion');
    expect(abierto('operacion')).toBe('true');
    expect(el('nav-group-operacion-list').hasAttribute('hidden')).toBe(false);
    clic('nav-group-analisis');
    expect(abierto('operacion')).toBe('false');
    expect(el('nav-group-operacion-list').hasAttribute('hidden')).toBe(true);
    expect(abierto('analisis')).toBe('true');
    clic('nav-group-analisis');
    expect(abierto('analisis')).toBe('false');
    expect(el('nav-group-analisis-list').hasAttribute('hidden')).toBe(true);
  });

  it('Escape y clic fuera cierran el menú abierto', async () => {
    await entrar('admin');
    clic('nav-group-admin');
    expect(abierto('admin')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(abierto('admin')).toBe('false');
    clic('nav-group-admin');
    expect(abierto('admin')).toBe('true');
    fireEvent.click(document.body);
    expect(abierto('admin')).toBe('false');
  });

  it('elegir una sección navega, cierra el menú y marca activa la sección y su grupo', async () => {
    await entrar('admin');
    expect(el('nav-group-analisis').hasAttribute('aria-current')).toBe(false);
    clic('nav-group-analisis');
    clic('nav-reportes');
    expect(await screen.findByTestId('reports-page')).toBeTruthy();
    expect(abierto('analisis')).toBe('false');
    expect(el('nav-reportes').getAttribute('aria-current')).toBe('page');
    expect(el('nav-group-analisis').getAttribute('aria-current')).toBe('true');
    expect(el('nav-group-operacion').hasAttribute('aria-current')).toBe(false);
    expect(el('nav-inicio').hasAttribute('aria-current')).toBe(false);
  });

  it('inicio se elige sin abrir ningún grupo', async () => {
    await entrar('admin');
    clic('nav-group-operacion');
    clic('nav-terminales');
    expect(await screen.findByTestId('terminals-page')).toBeTruthy();
    clic('nav-inicio');
    expect(await screen.findByTestId('home-welcome')).toBeTruthy();
    expect(el('nav-inicio').getAttribute('aria-current')).toBe('page');
    for (const g of NOMBRES) expect(abierto(g)).toBe('false');
  });
});

const INTERACTIVOS = 'a, button, input, select, textarea, [tabindex]';

describe('U3 login con ondas', () => {
  async function login() {
    mockApi({ me: null });
    render(<App />);
    await screen.findByTestId('login-form');
  }

  it('login-page contiene el formulario y las ondas, y las ondas son decorativas', async () => {
    await login();
    const pagina = el('login-page');
    const ondas = el('login-waves');
    expect(pagina.contains(el('login-form'))).toBe(true);
    expect(pagina.contains(ondas)).toBe(true);
    expect(ondas.getAttribute('aria-hidden')).toBe('true');
    expect(ondas.querySelectorAll(INTERACTIVOS)).toHaveLength(0);
    expect(ondas.querySelector('canvas')).toBeNull();
    expect(ondas.contains(el('login-form'))).toBe(false);
    expect(document.querySelectorAll('canvas')).toHaveLength(0);
  });

  it('las ondas son 4 anillos y el formulario sigue teniendo un único h1', async () => {
    await login();
    expect(el('login-waves').children).toHaveLength(4);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('la ruta sigue siendo /ingresar y la landing no se mezcla', async () => {
    await login();
    expect(window.location.pathname).toBe('/ingresar');
    expect(quizas('landing')).toBeNull();
    expect(quizas('app-shell')).toBeNull();
  });
});
