import { SalesQuerySchema, SummaryQuerySchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../application/errors';
import type { SalesCsvReport, SalesReport, SummaryReport } from '../../application/reports';
import { SESSION_COOKIE } from './routes-auth';

const BASE = '/api/v1/reports';

export interface ReportUseCases {
  summary: SummaryReport;
  sales: SalesReport;
  salesCsv: SalesCsvReport;
}

// Las rutas validan la consulta y llaman al caso de uso; las reglas viven en application/ y domain/.
export function registerReportRoutes(app: FastifyInstance, casos: ReportUseCases): void {
  app.get(`${BASE}/summary`, async (request) => {
    const consulta = SummaryQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.summary.execute(request.cookies[SESSION_COOKIE], consulta.data);
  });

  app.get(`${BASE}/sales`, async (request) => {
    const consulta = SalesQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.sales.execute(request.cookies[SESSION_COOKIE], consulta.data);
  });

  app.get(`${BASE}/sales.csv`, async (request, reply) => {
    const consulta = SalesQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    const { groupBy, from, to } = consulta.data;
    const csv = await casos.salesCsv.execute(request.cookies[SESSION_COOKIE], consulta.data);
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="ventas-${groupBy}-${from}-${to}.csv"`);
    return csv;
  });
}
