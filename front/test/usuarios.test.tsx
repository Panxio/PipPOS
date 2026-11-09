// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { es } from '../src/i18n';
import { mockApi, usuario } from './helpers';
import { errorApi, mockTerminalsApi } from './terminales-mock';
import { mensaje, mockUsersApi } from './usuarios-mock';

const id = (testid: string) => screen.getByTestId(testid);
const quizas = (testid: string) => screen.queryByTestId(testid);
const texto = (testid: string) => id(testid).textContent ?? '';
const escribir = (testid: string, value: string) => fireEvent.change(id(testid), { target: { value } });
const clic = (testid: string) => fireEvent.click(id(testid));
const deshabilitado = (testid: string) => (id(testid) as HTMLButtonElement).disabled;
const valor = (testid: string) => (id(testid) as HTMLInputElement).value;
const cuerpo = (p: { body: string | undefined } | undefined) => JSON.parse(p?.body ?? 'null') as unknown;
const irA = (ruta: string) => window.history.pushState({}, '', ruta);

afterEach(() => irA('/'));

async function abrir(opts: Parameters<typeof mockUsersApi>[1] = {}) {
  const api = mockUsersApi('admin', opts);
  render(<App />);
  fireEvent.click(await screen.findByTestId('nav-usuarios'));
  await screen.findByTestId('users-page');
  await screen.findByTestId('user-row-admin@pippos.test');
  await screen.findByTestId('branch-row-Centro');
  await waitFor(() => expect(screen.queryAllByTestId(/^mailbox-(item|empty|error)$/).length).toBeGreaterThan(0));
  return api;
}

async function asistenteHastaRol(nombre = 'Beto Cajero', correo = 'beto@pippos.test') {
  clic('user-new-button');
  await screen.findByTestId('wizard-step-data');
  escribir('wizard-name', nombre);
  escribir('wizard-email', correo);
  clic('wizard-next');
  await screen.findByTestId('wizard-step-role');
}

describe('F11 lista de usuarios', () => {
  it('reemplaza el relleno, pide usuarios, sucursales y bandeja y pinta las filas en el orden de la API', async () => {
    const { hechas } = await abrir();
    expect(quizas('placeholder-page')).toBeNull();
    for (const ruta of ['users', 'branches', 'mailbox']) expect(hechas('GET', `/api/v1/${ruta}`)).toHaveLength(1);
    const filas = within(id('users-table')).getAllByTestId(/^user-row-/).map((f) => f.getAttribute('data-testid'));
    expect(filas).toEqual(['admin', 'supervisor', 'cajero', 'ana', 'ines'].map((n) => `user-row-${n}@pippos.test`));
    const admin = texto('user-row-admin@pippos.test');
    for (const parte of ['admin demo', 'admin@pippos.test', es['role.admin'], es['users.status.active']]) expect(admin).toContain(parte);
    expect(admin).not.toMatch(/Centro|Norte/);
    const cajero = texto('user-row-cajero@pippos.test');
    for (const parte of [es['role.cajero'], 'Centro']) expect(cajero).toContain(parte);
    for (const parte of ['Norte', es['users.status.invited']]) expect(texto('user-row-ana@pippos.test')).toContain(parte);
    expect(texto('user-row-ines@pippos.test')).toContain(es['users.status.inactive']);
  });

  it('un fallo de la lista se muestra con el texto del código', async () => {
    mockUsersApi('admin', { override: (p) => (p.method === 'GET' && p.path === '/api/v1/users' ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    render(<App />);
    fireEvent.click(await screen.findByTestId('nav-usuarios'));
    expect((await screen.findByTestId('users-error')).textContent).toBe(es['error.INTERNAL_ERROR']);
  });
});

describe('F12 acciones por fila', () => {
  it('desactivar pide confirmación; cancelar no envía; aceptar hace PATCH {status:inactive} y recarga', async () => {
    const { hechas } = await abrir();
    clic('user-toggle-supervisor@pippos.test');
    expect(id('user-confirm')).toBeTruthy();
    expect(hechas('PATCH', '/api/v1/users/user-supervisor')).toHaveLength(0);
    clic('user-confirm-cancel');
    expect(quizas('user-confirm')).toBeNull();
    expect(hechas('PATCH', '/api/v1/users/user-supervisor')).toHaveLength(0);
    clic('user-toggle-supervisor@pippos.test');
    clic('user-confirm-accept');
    await waitFor(() => expect(texto('user-row-supervisor@pippos.test')).toContain(es['users.status.inactive']));
    expect(cuerpo(hechas('PATCH', '/api/v1/users/user-supervisor')[0])).toEqual({ status: 'inactive' });
    expect(quizas('user-confirm')).toBeNull();
    expect(hechas('GET', '/api/v1/users')).toHaveLength(2);
  });

  it('activar a un inactivo es directo, sin confirmación', async () => {
    const { hechas } = await abrir();
    clic('user-toggle-ines@pippos.test');
    expect(quizas('user-confirm')).toBeNull();
    await waitFor(() => expect(texto('user-row-ines@pippos.test')).toContain(es['users.status.active']));
    expect(cuerpo(hechas('PATCH', '/api/v1/users/u-ines')[0])).toEqual({ status: 'active' });
  });

  it('el propio usuario de la sesión no tiene desactivar ni reenviar', async () => {
    await abrir();
    expect(quizas('user-toggle-admin@pippos.test')).toBeNull();
    expect(quizas('user-resend-admin@pippos.test')).toBeNull();
    expect(quizas('user-toggle-supervisor@pippos.test')).not.toBeNull();
  });

  it('reenviar solo existe para invitados: hace POST sin cuerpo y recarga la bandeja', async () => {
    const { hechas } = await abrir();
    for (const correo of ['supervisor', 'cajero', 'ines']) expect(quizas(`user-resend-${correo}@pippos.test`)).toBeNull();
    expect(screen.getAllByTestId('mailbox-item')).toHaveLength(1);
    clic('user-resend-ana@pippos.test');
    await waitFor(() => expect(screen.getAllByTestId('mailbox-item')).toHaveLength(2));
    expect(hechas('POST', '/api/v1/users/u-ana/invitation')).toHaveLength(1);
    expect(hechas('GET', '/api/v1/mailbox')).toHaveLength(2);
  });

  it('un fallo de la acción se muestra con el texto del código', async () => {
    await abrir({ override: (p) => (p.method === 'PATCH' ? errorApi(409, 'CONFLICT') : undefined) });
    clic('user-toggle-ines@pippos.test');
    expect((await screen.findByTestId('users-action-error')).textContent).toBe(es['error.CONFLICT']);
  });
});

describe('F13 asistente de alta', () => {
  it('3 pasos: valida cada uno, conserva lo escrito al volver y envía lo escrito (cajero con sucursal)', async () => {
    const { hechas } = await abrir();
    clic('user-new-button');
    expect(id('user-wizard')).toBeTruthy();
    expect(id('wizard-step-data')).toBeTruthy();
    expect(quizas('wizard-step-role')).toBeNull();
    expect(quizas('wizard-step-summary')).toBeNull();
    expect(deshabilitado('wizard-next')).toBe(true);
    escribir('wizard-name', '   ');
    escribir('wizard-email', 'beto@pippos.test');
    expect(deshabilitado('wizard-next')).toBe(true);
    escribir('wizard-name', 'Beto Cajero');
    expect(deshabilitado('wizard-next')).toBe(false);
    clic('wizard-next');

    expect(quizas('wizard-step-data')).toBeNull();
    expect(valor('wizard-role')).toBe('cajero');
    const opciones = Array.from((id('wizard-branch') as HTMLSelectElement).options);
    expect(opciones.map((o) => o.value)).toEqual(['', 'b-1', 'b-2']);
    expect(opciones.slice(1).map((o) => o.textContent)).toEqual(['Centro', 'Norte']);
    expect(deshabilitado('wizard-next')).toBe(true);
    escribir('wizard-branch', 'b-2');
    expect(deshabilitado('wizard-next')).toBe(false);
    clic('wizard-next');

    expect(quizas('wizard-step-role')).toBeNull();
    expect(texto('wizard-summary-name')).toBe('Beto Cajero');
    expect(texto('wizard-summary-email')).toBe('beto@pippos.test');
    expect(texto('wizard-summary-role')).toBe(es['role.cajero']);
    expect(texto('wizard-summary-branch')).toBe('Norte');
    clic('wizard-back');
    expect(valor('wizard-role')).toBe('cajero');
    expect(valor('wizard-branch')).toBe('b-2');
    clic('wizard-back');
    expect(valor('wizard-name')).toBe('Beto Cajero');
    expect(valor('wizard-email')).toBe('beto@pippos.test');
    clic('wizard-next');
    clic('wizard-next');
    expect(hechas('POST', '/api/v1/users')).toHaveLength(0);
    clic('wizard-submit');

    await screen.findByTestId('user-row-beto@pippos.test');
    expect(quizas('user-wizard')).toBeNull();
    expect(cuerpo(hechas('POST', '/api/v1/users')[0])).toEqual({ name: 'Beto Cajero', email: 'beto@pippos.test', role: 'cajero', branchId: 'b-2' });
    expect(texto('user-row-beto@pippos.test')).toContain(es['users.status.invited']);
    await waitFor(() => expect(screen.getAllByTestId('mailbox-item')).toHaveLength(2));
    expect(screen.getAllByTestId('mailbox-item')[0]!.textContent).toContain('beto@pippos.test');
  });

  it('un rol que no es cajero puede ir sin sucursal y se envía branchId null', async () => {
    const { hechas } = await abrir();
    await asistenteHastaRol('Sara Super', 'sara@pippos.test');
    escribir('wizard-role', 'supervisor');
    expect(deshabilitado('wizard-next')).toBe(false);
    clic('wizard-next');
    expect(texto('wizard-summary-role')).toBe(es['role.supervisor']);
    clic('wizard-submit');
    await screen.findByTestId('user-row-sara@pippos.test');
    expect(cuerpo(hechas('POST', '/api/v1/users')[0])).toEqual({ name: 'Sara Super', email: 'sara@pippos.test', role: 'supervisor', branchId: null });
  });

  it('un fallo al crear queda en el resumen con el texto del código y los datos intactos', async () => {
    await abrir({ override: (p) => (p.method === 'POST' && p.path === '/api/v1/users' ? errorApi(409, 'CONFLICT') : undefined) });
    await asistenteHastaRol();
    escribir('wizard-branch', 'b-1');
    clic('wizard-next');
    clic('wizard-submit');
    expect((await screen.findByTestId('wizard-error')).textContent).toBe(es['error.CONFLICT']);
    expect(id('wizard-step-summary')).toBeTruthy();
    expect(texto('wizard-summary-email')).toBe('beto@pippos.test');
    expect(quizas('user-row-beto@pippos.test')).toBeNull();
    clic('wizard-back');
    clic('wizard-back');
    expect(valor('wizard-email')).toBe('beto@pippos.test');
  });

  it('cancelar cierra sin enviar y al reabrir todo parte vacío', async () => {
    const { hechas } = await abrir();
    await asistenteHastaRol();
    clic('wizard-cancel');
    expect(quizas('user-wizard')).toBeNull();
    expect(hechas('POST', '/api/v1/users')).toHaveLength(0);
    clic('user-new-button');
    expect(valor('wizard-name')).toBe('');
    expect(valor('wizard-email')).toBe('');
  });
});

describe('F14 sucursales y cajas', () => {
  it('cada sucursal muestra sus cajas', async () => {
    await abrir();
    for (const parte of ['Centro', 'Caja 1', 'Caja 2']) expect(texto('branch-row-Centro')).toContain(parte);
    for (const parte of ['Norte', 'Caja 3']) expect(texto('branch-row-Norte')).toContain(parte);
  });

  it('crear sucursal: POST {name}, recarga, vacía el campo y el asistente la ofrece', async () => {
    const { hechas } = await abrir();
    expect(deshabilitado('branch-new-submit')).toBe(true);
    escribir('branch-new-name', '   ');
    expect(deshabilitado('branch-new-submit')).toBe(true);
    escribir('branch-new-name', 'Sur');
    clic('branch-new-submit');
    await screen.findByTestId('branch-row-Sur');
    expect(cuerpo(hechas('POST', '/api/v1/branches')[0])).toEqual({ name: 'Sur' });
    expect(valor('branch-new-name')).toBe('');
    await asistenteHastaRol();
    expect(Array.from((id('wizard-branch') as HTMLSelectElement).options).map((o) => o.textContent)).toContain('Sur');
  });

  it('crear caja: POST {name} a la sucursal, recarga y vacía el campo', async () => {
    const { hechas } = await abrir();
    expect(deshabilitado('till-new-submit-Norte')).toBe(true);
    escribir('till-new-name-Norte', 'Caja 4');
    clic('till-new-submit-Norte');
    await waitFor(() => expect(texto('branch-row-Norte')).toContain('Caja 4'));
    expect(cuerpo(hechas('POST', '/api/v1/branches/b-2/tills')[0])).toEqual({ name: 'Caja 4' });
    expect(valor('till-new-name-Norte')).toBe('');
    expect(texto('branch-row-Centro')).not.toContain('Caja 4');
  });

  it('un fallo se muestra con el texto del código', async () => {
    await abrir({ override: (p) => (p.method === 'POST' && p.path === '/api/v1/branches' ? errorApi(409, 'CONFLICT') : undefined) });
    escribir('branch-new-name', 'Centro');
    clic('branch-new-submit');
    expect((await screen.findByTestId('branches-error')).textContent).toBe(es['error.CONFLICT']);
  });
});

describe('F15 bandeja', () => {
  it('un mensaje por entrada, en el orden de la API, con destinatario y enlace', async () => {
    await abrir({ mailbox: [mensaje(2, 'beto@pippos.test'), mensaje(1, 'ana@pippos.test')] });
    const items = screen.getAllByTestId('mailbox-item');
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('beto@pippos.test'), expect.stringContaining('ana@pippos.test')]);
    const enlace = within(items[0]!).getByTestId('mailbox-link');
    expect(enlace.tagName).toBe('A');
    expect(enlace.getAttribute('href')).toBe('/invitacion?token=tok-2');
    expect(quizas('mailbox-empty')).toBeNull();
  });

  it('vacía muestra mailbox-empty y ningún mensaje', async () => {
    await abrir({ mailbox: [] });
    expect(id('mailbox-empty')).toBeTruthy();
    expect(quizas('mailbox-item')).toBeNull();
  });

  it('fallo de la bandeja con el texto del código', async () => {
    await abrir({ override: (p) => (p.path === '/api/v1/mailbox' ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    expect(texto('mailbox-error')).toBe(es['error.INTERNAL_ERROR']);
  });
});

describe('F16 página de invitación (pública)', () => {
  it('sin sesión: fija la contraseña con el token de la URL (decodificado) y ofrece ir al login', async () => {
    const { hechas } = mockUsersApi(null);
    irA('/invitacion?token=tok%2Bx');
    render(<App />);
    await screen.findByTestId('invitation-page');
    expect(quizas('login-form')).toBeNull();
    expect(deshabilitado('invitation-submit')).toBe(true);
    escribir('invitation-password', 'clave-segura-2026');
    expect(deshabilitado('invitation-submit')).toBe(false);
    clic('invitation-submit');
    expect((await screen.findByTestId('invitation-done')).textContent).toBe(es['invitation.done']);
    expect(cuerpo(hechas('POST', '/api/v1/invitations/accept')[0])).toEqual({ token: 'tok+x', password: 'clave-segura-2026' });
    expect(quizas('invitation-password')).toBeNull();
    expect(id('invitation-login').tagName).toBe('A');
    expect(id('invitation-login').getAttribute('href')).toBe('/ingresar');
  });

  it('con una sesión abierta también se ve la página de invitación, no el shell', async () => {
    mockUsersApi('admin');
    irA('/invitacion?token=abc');
    render(<App />);
    await screen.findByTestId('invitation-page');
    expect(quizas('app-shell')).toBeNull();
  });

  it.each([[404, 'NOT_FOUND'], [400, 'VALIDATION_ERROR']] as const)('fallo %i %s: texto del código y el formulario sigue', async (status, code) => {
    mockUsersApi(null, { override: (p) => (p.path === '/api/v1/invitations/accept' ? errorApi(status, code) : undefined) });
    irA('/invitacion?token=abc');
    render(<App />);
    await screen.findByTestId('invitation-page');
    escribir('invitation-password', 'corta');
    clic('invitation-submit');
    expect((await screen.findByTestId('invitation-error')).textContent).toBe(es[`error.${code}`]);
    expect(id('invitation-password')).toBeTruthy();
    expect(quizas('invitation-done')).toBeNull();
  });

  it('sin token: error NOT_FOUND, sin formulario y sin petición', async () => {
    const { hechas } = mockUsersApi(null);
    irA('/invitacion');
    render(<App />);
    expect((await screen.findByTestId('invitation-error')).textContent).toBe(es['error.NOT_FOUND']);
    expect(quizas('invitation-password')).toBeNull();
    expect(quizas('invitation-submit')).toBeNull();
    expect(hechas('POST', '/api/v1/invitations/accept')).toHaveLength(0);
  });
});

describe('F17 cambiar contraseña', () => {
  async function abrirForm(role: 'admin' | 'cajero', opts: Parameters<typeof mockUsersApi>[1] = {}) {
    const api = mockUsersApi(role, opts);
    render(<App />);
    fireEvent.click(await screen.findByTestId('password-button'));
    await screen.findByTestId('password-form');
    return api;
  }

  it('cualquier rol: envía {current,next} y al terminar vuelve al login con el aviso', async () => {
    const { hechas } = await abrirForm('cajero');
    expect(deshabilitado('password-submit')).toBe(true);
    escribir('password-current', 'vieja-clave-1');
    expect(deshabilitado('password-submit')).toBe(true);
    escribir('password-next', 'nueva-clave-2');
    expect(deshabilitado('password-submit')).toBe(false);
    clic('password-submit');
    await screen.findByTestId('login-form');
    expect(quizas('app-shell')).toBeNull();
    expect(texto('login-notice')).toBe(es['login.passwordChanged']);
    expect(cuerpo(hechas('POST', '/api/v1/me/password')[0])).toEqual({ current: 'vieja-clave-1', next: 'nueva-clave-2' });
  });

  it('un fallo (401 de contraseña) se muestra con su texto, sigue en la sesión y cancelar cierra', async () => {
    await abrirForm('admin', { override: (p) => (p.path === '/api/v1/me/password' ? errorApi(401, 'INVALID_CREDENTIALS') : undefined) });
    escribir('password-current', 'mala');
    escribir('password-next', 'nueva-clave-2');
    clic('password-submit');
    expect((await screen.findByTestId('password-error')).textContent).toBe(es['error.INVALID_CREDENTIALS']);
    expect(quizas('login-form')).toBeNull();
    expect(id('app-shell')).toBeTruthy();
    expect(id('password-form')).toBeTruthy();
    clic('password-cancel');
    expect(quizas('password-form')).toBeNull();
  });
});

describe('F18 sesión expirada y acceso', () => {
  it('un 401 UNAUTHENTICATED de la sección de usuarios lleva al login con el aviso de sesión expirada', async () => {
    mockUsersApi('admin', { override: (p) => (p.path === '/api/v1/users' ? errorApi(401, 'UNAUTHENTICATED') : undefined) });
    render(<App />);
    fireEvent.click(await screen.findByTestId('nav-usuarios'));
    await screen.findByTestId('login-form');
    expect(texto('login-notice')).toBe(es['login.sessionExpired']);
    expect(quizas('app-shell')).toBeNull();
  });

  it('también en la sección de terminales', async () => {
    mockTerminalsApi('admin', { override: (p) => (p.method === 'GET' && p.path === '/api/v1/terminals' ? errorApi(401, 'UNAUTHENTICATED') : undefined) });
    render(<App />);
    fireEvent.click(await screen.findByTestId('nav-terminales'));
    await screen.findByTestId('login-form');
    expect(texto('login-notice')).toBe(es['login.sessionExpired']);
  });

  it('sin aviso: sin sesión al cargar, salir a mano y credenciales malas', async () => {
    mockApi({ me: null, loginError: { status: 401, code: 'INVALID_CREDENTIALS' } });
    render(<App />);
    await screen.findByTestId('login-form');
    expect(quizas('login-notice')).toBeNull();
    escribir('login-email', 'a@b.cl');
    escribir('login-password', 'x');
    clic('login-submit');
    await screen.findByTestId('login-error');
    expect(quizas('login-notice')).toBeNull();
  });

  it('sin aviso al salir a mano', async () => {
    mockApi({ me: usuario('admin') });
    render(<App />);
    fireEvent.click(await screen.findByTestId('logout-button'));
    await screen.findByTestId('login-form');
    expect(quizas('login-notice')).toBeNull();
  });

  it('cuenta bloqueada (423): el login muestra el texto de ACCOUNT_LOCKED', async () => {
    mockApi({ me: null, loginError: { status: 423, code: 'ACCOUNT_LOCKED' } });
    render(<App />);
    await screen.findByTestId('login-form');
    escribir('login-email', 'a@b.cl');
    escribir('login-password', 'x');
    clic('login-submit');
    expect((await screen.findByTestId('login-error')).textContent).toBe(es['error.ACCOUNT_LOCKED']);
  });
});
