import type { ReportGroupBy, ReportKpis, Role, SalesItem } from '@pippos/shared';
import { vi } from 'vitest';
import { mockApi, usuario } from './helpers';
import { respuesta, type Peticion } from './terminales-mock';
import type { Forzada } from './cobro-mock';

export const CSV_DEMO = 'key,label,sales,totalNet\r\n2026-11-13,2026-11-13,10,500000\r\n';

export const KPIS: ReportKpis = {
  totalNet: '1250000', sales: 25, avgTicket: '50000', attempts: 30, approvalBp: 8750, voidedCount: 2, voidedAmount: '40000',
};
export const KPIS_ANTERIOR: ReportKpis = {
  totalNet: '1000000', sales: 20, avgTicket: '50000', attempts: 32, approvalBp: 8125, voidedCount: 4, voidedAmount: '100000',
};

const dia = (key: string, sales: number, totalNet: string): SalesItem => ({ key, label: key, sales, totalNet });

export const VENTAS_DIA: SalesItem[] = [dia('2026-11-13', 10, '500000'), dia('2026-11-14', 0, '0'), dia('2026-11-15', 15, '750000')];

interface Opciones {
  kpis?: ReportKpis;
  anterior?: ReportKpis | null; // null = la respuesta no trae `previous`
  ventas?: Partial<Record<ReportGroupBy, SalesItem[]>>;
  csv?: string;
  override?: (p: Peticion) => Forzada;
}

// Simula /me y /reports/{summary,sales,sales.csv}. Los parámetros llegan tal cual para que el test los compare.
export function mockReportesApi(role: Role | null = 'admin', opts: Opciones = {}) {
  const base = mockApi({ me: role ? usuario(role) : null });
  const peticiones: Peticion[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://127.0.0.1:5173');
    if (!url.pathname.startsWith('/api/v1/reports/')) return base.fn(input, init);
    const p: Peticion = {
      method: (init?.method ?? 'GET').toUpperCase(), path: url.pathname, query: url.searchParams,
      body: typeof init?.body === 'string' ? init.body : undefined, contentType: new Headers(init?.headers).get('content-type'),
    };
    peticiones.push(p);
    const forzada = opts.override?.(p);
    if (forzada) return forzada;
    const from = Number(p.query.get('from'));
    const to = Number(p.query.get('to'));
    if (p.path.endsWith('/summary')) {
      const anterior = opts.anterior === undefined ? KPIS_ANTERIOR : opts.anterior;
      const largo = to - from + 1;
      return respuesta(200, {
        range: { from, to }, kpis: opts.kpis ?? KPIS,
        ...(anterior ? { previous: { range: { from: from - largo, to: from - 1 }, kpis: anterior } } : {}),
      });
    }
    if (p.path.endsWith('/sales.csv')) {
      return new Response(opts.csv ?? CSV_DEMO, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' } });
    }
    const groupBy = p.query.get('groupBy') as ReportGroupBy;
    return respuesta(200, { groupBy, items: opts.ventas?.[groupBy] ?? (groupBy === 'day' ? VENTAS_DIA : []) });
  }));
  const hechas = (sufijo: string) => peticiones.filter((p) => p.method === 'GET' && p.path === `/api/v1/reports/${sufijo}`);
  return { peticiones, resumenes: () => hechas('summary'), ventas: () => hechas('sales'), csvs: () => hechas('sales.csv') };
}
