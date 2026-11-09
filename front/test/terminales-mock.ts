import type { Role, Terminal } from '@pippos/shared';
import { vi } from 'vitest';
import { mockApi, usuario } from './helpers';

export interface Peticion { method: string; path: string; query: URLSearchParams; body: string | undefined; contentType: string | null }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const errorApi = (status: number, code: string) => json(status, { error: { code, correlationId: 'c-9' } });
export const respuesta = json;

export function terminal(n: number, cambios: Partial<Terminal> = {}): Terminal {
  const serial = `TERM-${String(n).padStart(4, '0')}`;
  return {
    id: `t-${n}`, serial, alias: `Caja ${n}`, model: 'PAX A920', branch: n % 2 === 0 ? 'Norte' : 'Centro', till: `C${n}`,
    status: 'active', firmware: '1.4.2', batteryPct: 87, connection: 'online', createdAt: n, ...cambios,
  };
}

export function crearTerminales(cuantos: number): Terminal[] {
  return Array.from({ length: cuantos }, (_, i) => terminal(i + 1, i + 1 === 3 ? { status: 'inactive', connection: 'offline' } : {}));
}

function listar(datos: Terminal[], q: URLSearchParams) {
  const texto = (q.get('q') ?? '').toLowerCase();
  const sort = (q.get('sort') ?? 'serial') as 'serial' | 'alias' | 'branch' | 'createdAt';
  const factor = q.get('order') === 'desc' ? -1 : 1;
  const pageSize = Number(q.get('pageSize') ?? 20);
  const page = Number(q.get('page') ?? 1);
  const filtrados = datos
    .filter((t) => !q.get('status') || t.status === q.get('status'))
    .filter((t) => !texto || t.serial.toLowerCase().includes(texto) || t.alias.toLowerCase().includes(texto))
    .sort((a, b) => (a[sort] < b[sort] ? -1 : a[sort] > b[sort] ? 1 : 0) * factor);
  return { items: filtrados.slice((page - 1) * pageSize, page * pageSize), total: filtrados.length, page, pageSize };
}

// Simula /me y /terminals con una lista en memoria. `override` responde primero (undefined = comportamiento normal).
export function mockTerminalsApi(role: Role, opts: { terminals?: Terminal[]; override?: (p: Peticion) => Response | undefined } = {}) {
  const base = mockApi({ me: usuario(role) });
  const datos = opts.terminals ?? crearTerminales(25);
  const peticiones: Peticion[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://127.0.0.1:5173');
    if (!url.pathname.startsWith('/api/v1/terminals')) return base.fn(input, init);
    const p: Peticion = {
      method: (init?.method ?? 'GET').toUpperCase(), path: url.pathname, query: url.searchParams,
      body: typeof init?.body === 'string' ? init.body : undefined, contentType: new Headers(init?.headers).get('content-type'),
    };
    peticiones.push(p);
    const forzada = opts.override?.(p);
    if (forzada) return forzada;
    const id = p.path.split('/')[4];
    if (p.method === 'GET' && id === undefined) return json(200, listar(datos, p.query));
    const encontrado = datos.find((t) => t.id === id);
    if (p.method === 'GET') return encontrado ? json(200, encontrado) : errorApi(404, 'NOT_FOUND');
    if (p.method === 'PATCH' && encontrado) {
      Object.assign(encontrado, JSON.parse(p.body ?? '{}'));
      return json(200, encontrado);
    }
    if (p.method === 'POST' && id === undefined) {
      const nuevo = terminal(datos.length + 1, JSON.parse(p.body ?? '{}'));
      datos.push(nuevo);
      return json(201, nuevo);
    }
    return errorApi(404, 'NOT_FOUND');
  }));
  const listas = () => peticiones.filter((p) => p.method === 'GET' && p.path === '/api/v1/terminals');
  return { peticiones, listas, datos };
}
