// @vitest-environment jsdom
import { IMPORT_ROW_CODES } from '@pippos/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { en, es } from '../src/i18n';
import { crearTerminales, errorApi, mockTerminalsApi, respuesta, terminal } from './terminales-mock';
import type { Role } from '@pippos/shared';

const id = (testid: string) => screen.getByTestId(testid);
const texto = (testid: string) => id(testid).textContent ?? '';
const escribir = (testid: string, value: string) => fireEvent.change(id(testid), { target: { value } });
const ultima = (listas: () => { query: URLSearchParams }[]) => listas().at(-1)!.query;

async function abrir(role: Role = 'admin', opts: Parameters<typeof mockTerminalsApi>[1] = {}) {
  const api = mockTerminalsApi(role, opts);
  render(<App />);
  fireEvent.click(await screen.findByTestId('nav-terminales'));
  await screen.findByTestId('terminals-page');
  return api;
}

describe('F1 lista', () => {
  it('reemplaza el relleno, pide la lista y pinta filas, total y paginación', async () => {
    const { listas } = await abrir();
    expect(await screen.findByTestId('terminal-row-TERM-0001')).toBeTruthy();
    expect(screen.queryByTestId('placeholder-page')).toBeNull();
    expect(listas()[0]!.query.get('pageSize')).toBe('20');
    expect(within(id('terminals-table')).getAllByTestId(/^terminal-row-/)).toHaveLength(20);
    expect(texto('terminals-total')).toBe('25');
    expect(texto('terminals-page-info').replace(/\s/g, '')).toBe('1/2');
    const fila = texto('terminal-row-TERM-0003');
    for (const parte of ['TERM-0003', 'Caja 3', 'Centro', es['terminals.status.inactive']]) expect(fila).toContain(parte);
    expect(texto('terminal-row-TERM-0001')).toContain(es['terminals.status.active']);
  });

  it('paginación: siguiente y anterior, deshabilitados en los extremos', async () => {
    const { listas } = await abrir();
    await screen.findByTestId('terminal-row-TERM-0001');
    expect((id('terminals-prev') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(id('terminals-next'));
    await screen.findByTestId('terminal-row-TERM-0025');
    expect(ultima(listas).get('page')).toBe('2');
    expect(within(id('terminals-table')).getAllByTestId(/^terminal-row-/)).toHaveLength(5);
    expect((id('terminals-next') as HTMLButtonElement).disabled).toBe(true);
    expect(texto('terminals-page-info').replace(/\s/g, '')).toBe('2/2');
    fireEvent.click(id('terminals-prev'));
    await screen.findByTestId('terminal-row-TERM-0001');
    expect(ultima(listas).get('page')).toBe('1');
  });

  it('un fallo de la lista se muestra traducido', async () => {
    await abrir('admin', { override: (p) => (p.method === 'GET' ? errorApi(500, 'INTERNAL_ERROR') : undefined) });
    expect(await screen.findByTestId('terminals-error')).toBeTruthy();
    expect(texto('terminals-error')).toContain(es['error.INTERNAL_ERROR']);
  });
});

describe('F2 filtros (cada cambio llama a la API y vuelve a la página 1)', () => {
  it('búsqueda, estado, orden y vacío', async () => {
    const { listas } = await abrir();
    await screen.findByTestId('terminal-row-TERM-0001');
    fireEvent.click(id('terminals-next'));
    await screen.findByTestId('terminal-row-TERM-0025');
    escribir('terminals-search', 'caja 7');
    await waitFor(() => expect(ultima(listas).get('q')).toBe('caja 7'));
    expect(ultima(listas).get('page')).toBe('1');
    await waitFor(() => expect(screen.queryByTestId('terminal-row-TERM-0001')).toBeNull());
    expect(screen.getByTestId('terminal-row-TERM-0007')).toBeTruthy();
    expect(texto('terminals-total')).toBe('1');

    escribir('terminals-search', '');
    escribir('terminals-status-filter', 'inactive');
    await waitFor(() => expect(ultima(listas).get('status')).toBe('inactive'));
    await waitFor(() => expect(texto('terminals-total')).toBe('1'));
    expect(screen.getByTestId('terminal-row-TERM-0003')).toBeTruthy();

    escribir('terminals-status-filter', '');
    escribir('terminals-sort', 'alias');
    escribir('terminals-order', 'desc');
    await waitFor(() => expect(ultima(listas).get('order')).toBe('desc'));
    expect(ultima(listas).get('sort')).toBe('alias');
    expect(ultima(listas).get('status')).toBeNull();

    escribir('terminals-search', 'zzz');
    expect(await screen.findByTestId('terminals-empty')).toBeTruthy();
    expect(texto('terminals-total')).toBe('0');
    expect(texto('terminals-page-info').replace(/\s/g, '')).toBe('1/1');
  });
});

describe('F3 permisos', () => {
  it('supervisor ve lista y detalle pero ninguna acción de escritura', async () => {
    await abrir('supervisor');
    await screen.findByTestId('terminal-row-TERM-0001');
    fireEvent.click(id('terminal-open-TERM-0001'));
    await screen.findByTestId('terminal-detail');
    for (const t of ['terminal-new-button', 'terminal-import-file', 'terminal-toggle-status'])
      expect(screen.queryByTestId(t), t).toBeNull();
  });

  it('admin ve las tres acciones de escritura', async () => {
    await abrir('admin');
    await screen.findByTestId('terminal-row-TERM-0001');
    fireEvent.click(id('terminal-open-TERM-0001'));
    await screen.findByTestId('terminal-detail');
    for (const t of ['terminal-new-button', 'terminal-import-file', 'terminal-toggle-status']) expect(screen.getByTestId(t), t).toBeTruthy();
  });
});

describe('F4 alta', () => {
  const campos = { serial: 'term-9001', alias: 'Patio', model: 'PAX A80', branch: 'Sur', till: 'Caja 9' };
  async function llenar() {
    fireEvent.click(id('terminal-new-button'));
    await screen.findByTestId('terminal-form');
    for (const [k, v] of Object.entries(campos)) escribir(`terminal-field-${k}`, v);
  }

  it('envía exactamente los 5 campos, cierra el formulario y recarga la lista', async () => {
    const { peticiones, listas } = await abrir();
    await screen.findByTestId('terminal-row-TERM-0001');
    const antes = listas().length;
    await llenar();
    fireEvent.click(id('terminal-form-submit'));
    await waitFor(() => expect(screen.queryByTestId('terminal-form')).toBeNull());
    const post = peticiones.find((p) => p.method === 'POST' && p.path === '/api/v1/terminals')!;
    expect(JSON.parse(post.body!)).toEqual(campos);
    expect(post.contentType).toContain('application/json');
    await waitFor(() => expect(listas().length).toBeGreaterThan(antes));
  });

  for (const [status, code] of [[409, 'CONFLICT'], [400, 'VALIDATION_ERROR']] as const) {
    it(`${code}: muestra el mensaje y deja el formulario abierto con lo escrito`, async () => {
      await abrir('admin', { override: (p) => (p.method === 'POST' ? errorApi(status, code) : undefined) });
      await screen.findByTestId('terminal-row-TERM-0001');
      await llenar();
      fireEvent.click(id('terminal-form-submit'));
      await screen.findByTestId('terminal-form-error');
      expect(texto('terminal-form-error')).toContain(es[`error.${code}`]);
      expect((id('terminal-field-serial') as HTMLInputElement).value).toBe(campos.serial);
    });
  }

  it('cancelar cierra el formulario sin llamar a la API', async () => {
    const { peticiones } = await abrir();
    await llenar();
    fireEvent.click(id('terminal-form-cancel'));
    expect(screen.queryByTestId('terminal-form')).toBeNull();
    expect(peticiones.some((p) => p.method === 'POST')).toBe(false);
  });
});

describe('F5 detalle', () => {
  it('muestra los campos traducidos y activa/desactiva con PATCH y recarga de la lista', async () => {
    const { peticiones, listas } = await abrir();
    await screen.findByTestId('terminal-row-TERM-0001');
    fireEvent.click(id('terminal-open-TERM-0001'));
    await screen.findByTestId('terminal-detail');
    expect(peticiones.some((p) => p.method === 'GET' && p.path === '/api/v1/terminals/t-1')).toBe(true);
    const esperado: Record<string, string> = {
      serial: 'TERM-0001', alias: 'Caja 1', model: 'PAX A920', branch: 'Centro', till: 'C1', firmware: '1.4.2',
      status: es['terminals.status.active'], connection: es['terminals.connection.online'],
    };
    for (const [k, v] of Object.entries(esperado)) expect(texto(`terminal-detail-${k}`), k).toContain(v);
    expect(texto('terminal-detail-battery')).toContain('87');

    const antes = listas().length;
    fireEvent.click(id('terminal-toggle-status'));
    fireEvent.click(await screen.findByTestId('terminal-confirm-accept'));
    await waitFor(() => expect(texto('terminal-detail-status')).toContain(es['terminals.status.inactive']));
    const patch = peticiones.find((p) => p.method === 'PATCH')!;
    expect(patch.path).toBe('/api/v1/terminals/t-1');
    expect(JSON.parse(patch.body!)).toEqual({ status: 'inactive' });
    await waitFor(() => expect(listas().length).toBeGreaterThan(antes));
    await waitFor(() => expect(texto('terminal-row-TERM-0001')).toContain(es['terminals.status.inactive']));

    fireEvent.click(id('terminal-toggle-status'));
    await waitFor(() => expect(texto('terminal-detail-status')).toContain(es['terminals.status.active']));
    expect(JSON.parse(peticiones.filter((p) => p.method === 'PATCH').at(-1)!.body!)).toEqual({ status: 'active' });
  });

  it('un terminal inactivo ofrece activar; cerrar el detalle lo oculta', async () => {
    const { peticiones } = await abrir();
    await screen.findByTestId('terminal-row-TERM-0003');
    fireEvent.click(id('terminal-open-TERM-0003'));
    await screen.findByTestId('terminal-detail');
    fireEvent.click(id('terminal-toggle-status'));
    await waitFor(() => expect(peticiones.some((p) => p.method === 'PATCH')).toBe(true));
    expect(JSON.parse(peticiones.find((p) => p.method === 'PATCH')!.body!)).toEqual({ status: 'active' });
    fireEvent.click(id('terminal-detail-close'));
    expect(screen.queryByTestId('terminal-detail')).toBeNull();
  });

  it('404 en el detalle se muestra traducido', async () => {
    await abrir('admin', { override: (p) => (p.path.endsWith('/t-1') ? errorApi(404, 'NOT_FOUND') : undefined) });
    await screen.findByTestId('terminal-row-TERM-0001');
    fireEvent.click(id('terminal-open-TERM-0001'));
    await screen.findByTestId('terminal-detail-error');
    expect(texto('terminal-detail-error')).toContain(es['error.NOT_FOUND']);
  });
});

describe('F6 importación CSV', () => {
  const csv = 'serial,alias,model,branch,till\r\nTERM-8001,"Bar, norte",PAX A920,Centro,C1\r\nXX,a,b,c,d\r\n';
  const archivo = (contenido = csv) => new File([contenido], 'terminales.csv', { type: 'text/csv' });
  const subir = (f: File) => fireEvent.change(id('terminal-import-file'), { target: { files: [f] } });
  const resultado = { created: 1, invalid: [{ row: 3, code: 'INVALID_SERIAL' }, { row: 5, code: 'UNSAFE_VALUE' }] };
  const importa = (p: { method: string; path: string }) => p.method === 'POST' && p.path === '/api/v1/terminals/import';

  it('envía el texto como text/csv, muestra creadas e inválidas con su mensaje y recarga la lista', async () => {
    const { peticiones, listas } = await abrir('admin', { override: (p) => (importa(p) ? respuesta(200, resultado) : undefined) });
    await screen.findByTestId('terminal-row-TERM-0001');
    const antes = listas().length;
    subir(archivo());
    await screen.findByTestId('terminal-import-result');
    const post = peticiones.find(importa)!;
    expect(post.contentType).toContain('text/csv');
    expect(post.body).toBe(csv);
    expect(texto('terminal-import-created')).toBe('1');
    const filas = screen.getAllByTestId('terminal-import-invalid-row').map((e) => e.textContent ?? '');
    expect(filas).toHaveLength(2);
    expect(filas[0]).toContain('3');
    expect(filas[0]).toContain(es['import.INVALID_SERIAL']);
    expect(filas[1]).toContain('5');
    expect(filas[1]).toContain(es['import.UNSAFE_VALUE']);
    await waitFor(() => expect(listas().length).toBeGreaterThan(antes));
  });

  it('los mensajes de fila salen en el idioma activo', async () => {
    await abrir('admin', { override: (p) => (importa(p) ? respuesta(200, resultado) : undefined) });
    fireEvent.change(id('lang-select'), { target: { value: 'en' } });
    await waitFor(() => expect(texto('nav-terminales')).toBe(en['nav.terminales']));
    subir(archivo());
    await screen.findByTestId('terminal-import-result');
    expect(screen.getAllByTestId('terminal-import-invalid-row')[0]!.textContent).toContain(en['import.INVALID_SERIAL']);
  });

  it('un 400 se muestra traducido y se puede importar otro archivo después', async () => {
    let intento = 0;
    const { peticiones } = await abrir('admin', {
      override: (p) => (importa(p) ? (++intento === 1 ? errorApi(400, 'VALIDATION_ERROR') : respuesta(200, { created: 2, invalid: [] })) : undefined),
    });
    subir(archivo('mal'));
    await screen.findByTestId('terminal-import-error');
    expect(texto('terminal-import-error')).toContain(es['error.VALIDATION_ERROR']);
    subir(archivo('serial,alias,model,branch,till\n'));
    await waitFor(() => expect(texto('terminal-import-created')).toBe('2'));
    expect(peticiones.filter(importa)).toHaveLength(2);
    expect(screen.queryByTestId('terminal-import-error')).toBeNull();
    expect(screen.queryAllByTestId('terminal-import-invalid-row')).toHaveLength(0);
  });
});

describe('F7 textos', () => {
  it('hay mensaje por cada código de fila y por cada estado/conexión, en es y en en', () => {
    for (const cat of [es, en]) {
      for (const c of IMPORT_ROW_CODES) expect(cat, `import.${c}`).toHaveProperty(`import.${c}`);
      for (const k of ['terminals.status.active', 'terminals.status.inactive', 'terminals.connection.online', 'terminals.connection.offline'])
        expect(cat, k).toHaveProperty(k);
    }
    expect(crearTerminales(2)).toHaveLength(2);
    expect(terminal(1).serial).toBe('TERM-0001');
  });
});

async function abrirDetalle(serial: string, role: Role = 'admin', opts: Parameters<typeof mockTerminalsApi>[1] = {}) {
  const api = await abrir(role, opts);
  await screen.findByTestId(`terminal-row-${serial}`);
  fireEvent.click(id(`terminal-open-${serial}`));
  await screen.findByTestId('terminal-detail');
  return api;
}
const parches = (peticiones: { method: string; body: string | undefined }[]) => peticiones.filter((p) => p.method === 'PATCH');

describe('F8 editar', () => {
  it('solo admin ve el botón; supervisor no', async () => {
    await abrirDetalle('TERM-0001', 'supervisor');
    expect(screen.queryByTestId('terminal-edit-button')).toBeNull();
  });

  it('abre con los valores actuales; sin cambios no se puede enviar', async () => {
    const { peticiones } = await abrirDetalle('TERM-0001');
    fireEvent.click(id('terminal-edit-button'));
    await screen.findByTestId('terminal-edit-form');
    expect((id('terminal-edit-alias') as HTMLInputElement).value).toBe('Caja 1');
    expect((id('terminal-edit-branch') as HTMLInputElement).value).toBe('Centro');
    expect((id('terminal-edit-till') as HTMLInputElement).value).toBe('C1');
    expect((id('terminal-edit-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(id('terminal-edit-submit'));
    expect(parches(peticiones)).toHaveLength(0);
  });

  it('envía solo los campos cambiados, tal como se escribieron; cierra, actualiza el detalle y recarga la lista', async () => {
    const { peticiones, listas } = await abrirDetalle('TERM-0001');
    fireEvent.click(id('terminal-edit-button'));
    await screen.findByTestId('terminal-edit-form');
    escribir('terminal-edit-alias', '  Barra nueva ');
    const antes = listas().length;
    fireEvent.click(id('terminal-edit-submit'));
    await waitFor(() => expect(screen.queryByTestId('terminal-edit-form')).toBeNull());
    expect(parches(peticiones)).toHaveLength(1);
    expect(parches(peticiones)[0]!.body && JSON.parse(parches(peticiones)[0]!.body!)).toEqual({ alias: '  Barra nueva ' });
    expect(texto('terminal-detail-alias')).toContain('Barra nueva');
    await waitFor(() => expect(listas().length).toBeGreaterThan(antes));
    await waitFor(() => expect(texto('terminal-row-TERM-0001')).toContain('Barra nueva'));
  });

  it('puede cambiar los tres campos a la vez', async () => {
    const { peticiones } = await abrirDetalle('TERM-0001');
    fireEvent.click(id('terminal-edit-button'));
    await screen.findByTestId('terminal-edit-form');
    escribir('terminal-edit-alias', 'A');
    escribir('terminal-edit-branch', 'B');
    escribir('terminal-edit-till', 'C');
    fireEvent.click(id('terminal-edit-submit'));
    await waitFor(() => expect(parches(peticiones)).toHaveLength(1));
    expect(JSON.parse(parches(peticiones)[0]!.body!)).toEqual({ alias: 'A', branch: 'B', till: 'C' });
  });

  it('un fallo se muestra traducido y el formulario sigue abierto', async () => {
    await abrirDetalle('TERM-0001', 'admin', { override: (p) => (p.method === 'PATCH' ? errorApi(400, 'VALIDATION_ERROR') : undefined) });
    fireEvent.click(id('terminal-edit-button'));
    await screen.findByTestId('terminal-edit-form');
    escribir('terminal-edit-alias', 'X');
    fireEvent.click(id('terminal-edit-submit'));
    await screen.findByTestId('terminal-edit-error');
    expect(texto('terminal-edit-error')).toContain(es['error.VALIDATION_ERROR']);
    expect(screen.getByTestId('terminal-edit-form')).toBeTruthy();
  });

  it('cancelar cierra sin enviar; abrir otro terminal no arrastra el formulario', async () => {
    const { peticiones } = await abrirDetalle('TERM-0001');
    fireEvent.click(id('terminal-edit-button'));
    await screen.findByTestId('terminal-edit-form');
    escribir('terminal-edit-alias', 'X');
    fireEvent.click(id('terminal-edit-cancel'));
    expect(screen.queryByTestId('terminal-edit-form')).toBeNull();
    expect(parches(peticiones)).toHaveLength(0);

    fireEvent.click(id('terminal-edit-button'));
    await screen.findByTestId('terminal-edit-form');
    fireEvent.click(id('terminal-open-TERM-0002'));
    await waitFor(() => expect(texto('terminal-detail-serial')).toContain('TERM-0002'));
    expect(screen.queryByTestId('terminal-edit-form')).toBeNull();
  });
});

describe('F9 confirmar al desactivar', () => {
  it('desactivar un terminal activo pide confirmación y no envía nada hasta aceptar', async () => {
    const { peticiones } = await abrirDetalle('TERM-0001');
    fireEvent.click(id('terminal-toggle-status'));
    await screen.findByTestId('terminal-confirm');
    expect(parches(peticiones)).toHaveLength(0);
    fireEvent.click(id('terminal-confirm-accept'));
    await waitFor(() => expect(parches(peticiones)).toHaveLength(1));
    expect(JSON.parse(parches(peticiones)[0]!.body!)).toEqual({ status: 'inactive' });
    await waitFor(() => expect(screen.queryByTestId('terminal-confirm')).toBeNull());
  });

  it('cancelar la confirmación no envía nada y deja el estado', async () => {
    const { peticiones } = await abrirDetalle('TERM-0001');
    fireEvent.click(id('terminal-toggle-status'));
    await screen.findByTestId('terminal-confirm');
    fireEvent.click(id('terminal-confirm-cancel'));
    expect(screen.queryByTestId('terminal-confirm')).toBeNull();
    expect(parches(peticiones)).toHaveLength(0);
    expect(texto('terminal-detail-status')).toContain(es['terminals.status.active']);
  });

  it('activar un terminal inactivo es directo, sin confirmación', async () => {
    const { peticiones } = await abrirDetalle('TERM-0003');
    fireEvent.click(id('terminal-toggle-status'));
    await waitFor(() => expect(parches(peticiones)).toHaveLength(1));
    expect(screen.queryByTestId('terminal-confirm')).toBeNull();
    expect(JSON.parse(parches(peticiones)[0]!.body!)).toEqual({ status: 'active' });
  });
});
