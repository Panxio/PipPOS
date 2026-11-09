import type { Receipt, Role, Terminal, TransactionDetail, TransactionStatus } from '@pippos/shared';
import { vi } from 'vitest';
import { mockApi, usuario } from './helpers';
import { crearTerminales, errorApi, respuesta, type Peticion } from './terminales-mock';

export type Forzada = Response | Promise<Response> | undefined;

// Transacción ya resuelta; el importe y lo devuelto son strings, como en la API.
export function tx(folio: number, cambios: Partial<TransactionDetail> = {}): TransactionDetail {
  return {
    id: `tx-${folio}`, folio, terminalId: 't-1', cashierId: 'user-cajero', amount: '1000', refundedAmount: '0',
    method: 'card', brand: 'visa', last4: '1111', status: 'approved', responseCode: '00', authCode: 'A12345',
    createdAt: 1_000_000 + folio, events: [{ kind: 'created', amount: '1000', at: 1_000_000 + folio, byUserId: 'user-cajero' }], ...cambios,
  };
}

const num = (texto: string | null) => (texto === null ? null : Number(texto));

function filtrar(datos: TransactionDetail[], q: URLSearchParams) {
  const desde = num(q.get('from'));
  const hasta = num(q.get('to'));
  const min = num(q.get('min'));
  const max = num(q.get('max'));
  const items = datos
    .filter((t) => !q.get('status') || t.status === q.get('status'))
    .filter((t) => !q.get('method') || t.method === q.get('method'))
    .filter((t) => !q.get('brand') || t.brand === q.get('brand'))
    .filter((t) => !q.get('terminalId') || t.terminalId === q.get('terminalId'))
    .filter((t) => desde === null || t.createdAt >= desde)
    .filter((t) => hasta === null || t.createdAt <= hasta)
    .filter((t) => min === null || Number(t.amount) >= min)
    .filter((t) => max === null || Number(t.amount) <= max)
    .sort((a, b) => b.createdAt - a.createdAt || b.folio - a.folio);
  const pageSize = Number(q.get('pageSize') ?? 20);
  const page = Number(q.get('page') ?? 1);
  const pagina = items.slice((page - 1) * pageSize, page * pageSize).map(({ events: _e, ...resto }) => resto);
  return { items: pagina, total: items.length, page, pageSize };
}

// Resultado del switch simulado por last4 (C3).
function resolver(last4: string): { status: TransactionStatus; responseCode: string | null; authCode: string | null } {
  if (last4 === '0051') return { status: 'declined', responseCode: '51', authCode: null };
  if (last4 === '0005') return { status: 'declined', responseCode: '05', authCode: null };
  if (last4 === '0408') return { status: 'timeout', responseCode: null, authCode: null };
  return { status: 'approved', responseCode: '00', authCode: '654321' };
}

interface Opciones {
  terminals?: Terminal[];
  txs?: TransactionDetail[];
  override?: (p: Peticion) => Forzada;
  receipt?: Receipt;
}

// Simula /me, /terminals, /transactions (lista, alta idempotente, detalle, void, refund) y el comprobante.
export function mockCobroApi(role: Role | null = 'admin', opts: Opciones = {}) {
  const base = mockApi({ me: role ? usuario(role) : null });
  const terminals = opts.terminals ?? crearTerminales(3);
  const txs = opts.txs ?? [];
  const peticiones: Peticion[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://127.0.0.1:5173');
    const esTerminales = url.pathname === '/api/v1/terminals';
    if (!esTerminales && !url.pathname.startsWith('/api/v1/transactions')) return base.fn(input, init);
    const p: Peticion = {
      method: (init?.method ?? 'GET').toUpperCase(), path: url.pathname, query: url.searchParams,
      body: typeof init?.body === 'string' ? init.body : undefined, contentType: new Headers(init?.headers).get('content-type'),
    };
    peticiones.push(p);
    const forzada = opts.override?.(p);
    if (forzada) return forzada;
    if (esTerminales) return respuesta(200, { items: terminals, total: terminals.length, page: 1, pageSize: 100 });
    const [, , , , id, sub] = p.path.split('/');
    const cuerpo = JSON.parse(p.body ?? '{}') as Record<string, string>;
    const buscada = txs.find((t) => t.id === id);
    if (p.method === 'GET' && !id) return respuesta(200, filtrar(txs, p.query));
    if (p.method === 'POST' && !id) {
      const previa = txs.find((t) => t.id === `req-${cuerpo.requestId}`);
      if (previa) return respuesta(200, previa);
      const folio = txs.length + 1;
      const nueva = tx(folio, { id: `req-${cuerpo.requestId}`, terminalId: cuerpo.terminalId, amount: cuerpo.amount, method: cuerpo.method as 'card', brand: cuerpo.brand as 'visa', last4: cuerpo.last4, ...resolver(cuerpo.last4) });
      txs.push(nueva);
      return respuesta(201, nueva);
    }
    if (!buscada) return errorApi(404, 'NOT_FOUND');
    if (p.method === 'GET' && !sub) return respuesta(200, buscada);
    if (p.method === 'GET' && sub === 'receipt') {
      return respuesta(200, opts.receipt ?? { folio: buscada.folio, merchantName: 'Boliche La Noche', terminalAlias: 'Caja 1', amount: buscada.amount, refundedAmount: buscada.refundedAmount, method: buscada.method, brand: buscada.brand, last4: buscada.last4, status: buscada.status, authCode: buscada.authCode, createdAt: buscada.createdAt });
    }
    if (p.method === 'POST' && sub === 'void') {
      buscada.status = 'voided';
      buscada.events.push({ kind: 'voided', amount: buscada.amount, at: 2_000_000, byUserId: 'user-admin' });
      return respuesta(200, buscada);
    }
    if (p.method === 'POST' && sub === 'refund') {
      const devuelto = Number(buscada.refundedAmount) + Number(cuerpo.amount);
      buscada.refundedAmount = String(devuelto);
      buscada.status = devuelto >= Number(buscada.amount) ? 'refunded' : 'partially_refunded';
      buscada.events.push({ kind: 'refunded', amount: cuerpo.amount, at: 2_000_000, byUserId: 'user-admin' });
      return respuesta(200, buscada);
    }
    return errorApi(404, 'NOT_FOUND');
  }));
  const hechas = (method: string, path: string) => peticiones.filter((p) => p.method === method && p.path === path);
  const listas = () => hechas('GET', '/api/v1/transactions');
  const cobros = () => hechas('POST', '/api/v1/transactions');
  return { peticiones, hechas, listas, cobros, txs, terminals };
}
