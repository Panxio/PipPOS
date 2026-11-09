import type { Branch, MailboxMessage, Role, User } from '@pippos/shared';
import { vi } from 'vitest';
import { mockApi, usuario } from './helpers';
import { respuesta, type Peticion } from './terminales-mock';

const RUTAS = ['/api/v1/users', '/api/v1/branches', '/api/v1/mailbox', '/api/v1/invitations', '/api/v1/me/password'];

export const semillaUsuarios = (): User[] => [
  { id: 'user-admin', name: 'admin demo', email: 'admin@pippos.test', role: 'admin', status: 'active', branchId: null },
  { id: 'user-supervisor', name: 'supervisor demo', email: 'supervisor@pippos.test', role: 'supervisor', status: 'active', branchId: null },
  { id: 'user-cajero', name: 'cajero demo', email: 'cajero@pippos.test', role: 'cajero', status: 'active', branchId: 'b-1' },
  { id: 'u-ana', name: 'Ana Invitada', email: 'ana@pippos.test', role: 'cajero', status: 'invited', branchId: 'b-2' },
  { id: 'u-ines', name: 'Ines Inactiva', email: 'ines@pippos.test', role: 'supervisor', status: 'inactive', branchId: null },
];

export const semillaSucursales = (): Branch[] => [
  { id: 'b-1', name: 'Centro', tills: [{ id: 't-1', name: 'Caja 1' }, { id: 't-2', name: 'Caja 2' }] },
  { id: 'b-2', name: 'Norte', tills: [{ id: 't-3', name: 'Caja 3' }] },
];

export const mensaje = (n: number, to: string): MailboxMessage => ({
  id: `m-${n}`, to, kind: 'invitation', link: `/invitacion?token=tok-${n}`, createdAt: n,
});

interface Opciones { override?: (p: Peticion) => Response | undefined; mailbox?: MailboxMessage[] }

// Simula /me, /users, /branches, /mailbox, /invitations/accept y /me/password con listas en memoria.
// role = null: sin sesión. `override` responde primero (undefined = comportamiento normal).
export function mockUsersApi(role: Role | null = 'admin', opts: Opciones = {}) {
  const base = mockApi({ me: role ? usuario(role) : null });
  const users = semillaUsuarios();
  const branches = semillaSucursales();
  const mailbox = opts.mailbox ?? [mensaje(1, 'ana@pippos.test')];
  const peticiones: Peticion[] = [];
  let contador = 10;
  const enviar = (to: string) => {
    contador += 1;
    mailbox.unshift(mensaje(contador, to));
  };

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://127.0.0.1:5173');
    if (!RUTAS.some((r) => url.pathname.startsWith(r))) return base.fn(input, init);
    const p: Peticion = {
      method: (init?.method ?? 'GET').toUpperCase(), path: url.pathname, query: url.searchParams,
      body: typeof init?.body === 'string' ? init.body : undefined, contentType: new Headers(init?.headers).get('content-type'),
    };
    peticiones.push(p);
    const forzada = opts.override?.(p);
    if (forzada) return forzada;
    const [, , , recurso, id, sub] = p.path.split('/');
    const cuerpo = JSON.parse(p.body ?? '{}') as Record<string, unknown>;
    const noEncontrado = respuesta(404, { error: { code: 'NOT_FOUND', correlationId: 'c-9' } });
    if (recurso === 'users') {
      const usuarioPedido = users.find((u) => u.id === id);
      if (p.method === 'GET' && !id) return respuesta(200, { items: users });
      if (p.method === 'POST' && !id) {
        const nuevo = { id: `u-${users.length + 1}`, branchId: null, ...cuerpo, status: 'invited' } as User;
        users.push(nuevo);
        enviar(nuevo.email);
        return respuesta(201, nuevo);
      }
      if (p.method === 'PATCH' && usuarioPedido) return respuesta(200, Object.assign(usuarioPedido, cuerpo));
      if (p.method === 'POST' && sub === 'invitation' && usuarioPedido) {
        enviar(usuarioPedido.email);
        return new Response(null, { status: 204 });
      }
    }
    if (recurso === 'branches') {
      const sucursal = branches.find((b) => b.id === id);
      if (p.method === 'GET' && !id) return respuesta(200, { items: branches });
      if (p.method === 'POST' && !id) {
        const nueva: Branch = { id: `b-${branches.length + 1}`, name: String(cuerpo.name), tills: [] };
        branches.push(nueva);
        return respuesta(201, nueva);
      }
      if (p.method === 'POST' && sub === 'tills' && sucursal) {
        sucursal.tills.push({ id: `t-${contador++}`, name: String(cuerpo.name) });
        return respuesta(201, sucursal);
      }
    }
    if (recurso === 'mailbox' && p.method === 'GET') return respuesta(200, { items: mailbox });
    if (recurso === 'invitations' || (recurso === 'me' && p.method === 'POST')) return new Response(null, { status: 204 });
    return noEncontrado;
  }));

  const hechas = (method: string, path: string) => peticiones.filter((p) => p.method === method && p.path === path);
  return { peticiones, hechas, users, branches, mailbox };
}
