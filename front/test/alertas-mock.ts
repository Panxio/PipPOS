import { type Alert, type AlertSettings, type AuditEntry, type Role, type User } from '@pippos/shared';
import { vi } from 'vitest';
import { mockApi, usuario } from './helpers';
import { errorApi, respuesta, type Peticion } from './terminales-mock';
import type { Forzada } from './cobro-mock';

export const CSV_AUDITORIA = 'seq,atMs,actorId,actorName,action,entityType,entityId,detail\r\n3,1700000180000,user-admin,admin demo,auth.login,user,user-admin,{}\r\n';

export const ALERTA_OFFLINE: Alert = {
  id: 'al-1', type: 'terminal_offline', createdAt: 3000, resolvedAt: null, read: false,
  params: { terminalId: 't-2', alias: 'Caja 2' },
};
export const ALERTA_BATERIA: Alert = {
  id: 'al-2', type: 'battery_low', createdAt: 2000, resolvedAt: null, read: false,
  params: { terminalId: 't-2', alias: 'Caja 2', batteryPct: 12 },
};
export const ALERTA_ANULACION: Alert = {
  id: 'al-3', type: 'void_over_threshold', createdAt: 1000, resolvedAt: null, read: true,
  params: { transactionId: 'tx-9', folio: 'F-000009', amount: '150000' },
};
export const alertasDemo = (): Alert[] => [{ ...ALERTA_OFFLINE }, { ...ALERTA_BATERIA }, { ...ALERTA_ANULACION }];

export const USUARIOS_AUDITORIA = [
  { id: 'user-admin', name: 'admin demo', email: 'admin@pippos.test', role: 'admin', status: 'active', branchId: null },
  { id: 'user-supervisor', name: 'supervisor demo', email: 'supervisor@pippos.test', role: 'supervisor', status: 'active', branchId: null },
] as const satisfies readonly User[];

const MS_BASE = 1_700_000_000_000;
export const ACCIONES_DEMO = ['terminal.updated', 'auth.login', 'terminal.created'] as const; // seq % 3 = 0, 1, 2

// n entradas con seq 1..n (la API las lista con seq descendente). Actor y acción rotan para poder filtrar.
export function entradasDemo(n: number): AuditEntry[] {
  return Array.from({ length: n }, (_, i) => {
    const seq = i + 1;
    const admin = seq % 2 === 1;
    return {
      seq, atMs: MS_BASE + seq * 60_000,
      actorId: admin ? 'user-admin' : 'user-supervisor', actorName: admin ? 'admin demo' : 'supervisor demo',
      action: ACCIONES_DEMO[seq % 3],
      entityType: 'terminal', entityId: `t-${seq}`, detail: { alias: `Caja ${seq}` },
    };
  });
}

interface Opciones {
  alertas?: Alert[];
  settings?: AlertSettings;
  entradas?: AuditEntry[];
  csv?: string;
  override?: (p: Peticion) => Forzada;
}

const PREFIJOS = ['/api/v1/alerts', '/api/v1/alert-settings', '/api/v1/audit', '/api/v1/users'];

// Simula /me, /alerts, /alert-settings, /audit(.csv) y /users con estado en memoria. `override` responde primero.
// Reevalúa como la API real lo justo para los checks: una alerta de batería deja de estar abierta si el umbral baja del porcentaje.
export function mockAlertasApi(role: Role | null = 'admin', opts: Opciones = {}) {
  const base = mockApi({ me: role ? usuario(role) : null });
  const alertas = opts.alertas ?? alertasDemo();
  let settings: AlertSettings = opts.settings ?? { batteryBelowPct: 20, voidAtLeastAmount: '100000' };
  const entradas = opts.entradas ?? entradasDemo(45);
  const peticiones: Peticion[] = [];

  const abiertas = () => alertas.filter((a) => a.resolvedAt === null);
  const reevaluar = () => {
    for (const a of alertas) {
      if (a.type === 'battery_low' && a.resolvedAt === null && Number(a.params.batteryPct) >= settings.batteryBelowPct) a.resolvedAt = 9_999;
    }
  };

  function filtrarAuditoria(q: URLSearchParams): AuditEntry[] {
    return entradas
      .filter((e) => !q.get('action') || e.action === q.get('action'))
      .filter((e) => !q.get('actorId') || e.actorId === q.get('actorId'))
      .filter((e) => !q.get('from') || e.atMs >= Number(q.get('from')))
      .filter((e) => !q.get('to') || e.atMs <= Number(q.get('to')))
      .sort((a, b) => b.seq - a.seq);
  }

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://127.0.0.1:5173');
    if (!PREFIJOS.some((p) => url.pathname.startsWith(p))) return base.fn(input, init);
    const p: Peticion = {
      method: (init?.method ?? 'GET').toUpperCase(), path: url.pathname, query: url.searchParams,
      body: typeof init?.body === 'string' ? init.body : undefined, contentType: new Headers(init?.headers).get('content-type'),
    };
    peticiones.push(p);
    const forzada = opts.override?.(p);
    if (forzada) return forzada;

    if (p.path === '/api/v1/alerts' && p.method === 'GET') {
      reevaluar();
      const soloNoLeidas = p.query.get('unread') === 'true';
      const limite = Number(p.query.get('limit') ?? 50);
      const items = alertas.filter((a) => !soloNoLeidas || (!a.read && a.resolvedAt === null)).slice(0, limite);
      return respuesta(200, { items, unreadCount: abiertas().filter((a) => !a.read).length });
    }
    if (p.path === '/api/v1/alerts/read-all' && p.method === 'POST') {
      let marked = 0;
      for (const a of abiertas()) if (!a.read) { a.read = true; marked += 1; }
      return respuesta(200, { marked });
    }
    const leida = /^\/api\/v1\/alerts\/([^/]+)\/read$/.exec(p.path);
    if (leida && p.method === 'POST') {
      const alerta = alertas.find((a) => a.id === leida[1]);
      if (!alerta) return errorApi(404, 'NOT_FOUND');
      alerta.read = true;
      return respuesta(200, { id: alerta.id, read: true });
    }
    if (p.path === '/api/v1/alert-settings') {
      if (p.method === 'PUT') {
        settings = JSON.parse(p.body ?? '{}') as AlertSettings;
        return respuesta(200, settings);
      }
      return respuesta(200, settings);
    }
    if (p.path === '/api/v1/users') return respuesta(200, { items: USUARIOS_AUDITORIA });
    if (p.path === '/api/v1/audit.csv') {
      return new Response(opts.csv ?? CSV_AUDITORIA, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' } });
    }
    if (p.path === '/api/v1/audit') {
      const filtradas = filtrarAuditoria(p.query);
      const pageSize = Number(p.query.get('pageSize') ?? 20);
      const page = Number(p.query.get('page') ?? 1);
      return respuesta(200, { items: filtradas.slice((page - 1) * pageSize, page * pageSize), total: filtradas.length, page, pageSize });
    }
    return errorApi(404, 'NOT_FOUND');
  }));

  const hechas = (metodo: string, ruta: string) => peticiones.filter((p) => p.method === metodo && p.path === `/api/v1/${ruta}`);
  return {
    peticiones, alertas, entradas,
    listas: () => hechas('GET', 'alerts'),
    lecturas: () => peticiones.filter((p) => p.method === 'POST' && p.path.startsWith('/api/v1/alerts/')),
    ajustesLeidos: () => hechas('GET', 'alert-settings'),
    ajustesGuardados: () => hechas('PUT', 'alert-settings'),
    auditorias: () => hechas('GET', 'audit'),
    csvs: () => hechas('GET', 'audit.csv'),
    deAuditoria: () => peticiones.filter((p) => p.path.startsWith('/api/v1/audit')),
  };
}
