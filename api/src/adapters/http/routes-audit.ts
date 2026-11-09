import { ExportAuditQuerySchema, ListAuditQuerySchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import type { ExportAuditCsv, ListAudit } from '../../application/audit';
import { AppError } from '../../application/errors';
import { SESSION_COOKIE } from './routes-auth';

const BASE = '/api/v1/audit';

export interface AuditUseCases {
  list: ListAudit;
  exportCsv: ExportAuditCsv;
}

// Solo lectura: no hay rutas de escritura ni de borrado (PUT, PATCH y DELETE responden 404).
export function registerAuditRoutes(app: FastifyInstance, casos: AuditUseCases): void {
  app.get(BASE, async (request) => {
    const consulta = ListAuditQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.list.execute(request.cookies[SESSION_COOKIE], consulta.data);
  });

  app.get(`${BASE}.csv`, async (request, reply) => {
    const consulta = ExportAuditQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    const csv = await casos.exportCsv.execute(request.cookies[SESSION_COOKIE], consulta.data);
    const desde = consulta.data.from ?? 'todo';
    const hasta = consulta.data.to ?? 'todo';
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="auditoria-${desde}-${hasta}.csv"`);
    return csv;
  });
}
