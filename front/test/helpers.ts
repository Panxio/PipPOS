import { type ErrorCode, type Preferences, type Role, type SessionUser, SECTIONS } from '@pippos/shared';
import { vi } from 'vitest';

export const SECCIONES: Record<Role, readonly (typeof SECTIONS)[number][]> = {
  admin: ['inicio', 'terminales', 'usuarios', 'transacciones', 'reportes', 'alertas', 'liquidaciones'],
  supervisor: ['inicio', 'terminales', 'transacciones', 'reportes', 'alertas'],
  cajero: ['inicio', 'transacciones'],
};

export function usuario(role: Role, preferences: Preferences = { language: 'es', theme: 'light' }): SessionUser {
  return {
    id: `user-${role}`, name: `${role} demo`, email: `${role}@pippos.test`, role,
    merchantName: 'Boliche La Noche', sections: [...SECCIONES[role]], preferences,
  };
}

export interface Llamada { method: string; path: string; body: unknown }

// Simula la API: `me` es el usuario con sesión (null = sin sesión); `loginError` fuerza un rechazo del login.
export function mockApi(opts: { me: SessionUser | null; loginUser?: SessionUser; loginError?: { status: number; code: ErrorCode } }) {
  let sesion = opts.me;
  const llamadas: Llamada[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://127.0.0.1:5173').pathname;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    llamadas.push({ method, path, body });
    if (path === '/api/v1/me' && method === 'GET')
      return sesion ? json(200, sesion) : json(401, { error: { code: 'UNAUTHENTICATED', correlationId: 'c-1' } });
    if (path === '/api/v1/auth/login') {
      if (opts.loginError) return json(opts.loginError.status, { error: { code: opts.loginError.code, correlationId: 'c-2' } });
      sesion = opts.loginUser ?? sesion;
      return json(200, sesion);
    }
    if (path === '/api/v1/auth/logout') { sesion = null; return new Response(null, { status: 204 }); }
    if (path === '/api/v1/me/preferences' && method === 'PUT') {
      if (sesion) sesion = { ...sesion, preferences: body as Preferences };
      return json(200, body);
    }
    return json(404, { error: { code: 'NOT_FOUND', correlationId: 'c-3' } });
  });
  vi.stubGlobal('fetch', fn);
  return { llamadas, fn };
}
