import type { DatabaseSync } from 'node:sqlite';
import type { ErrorBody } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';

// Health sin sesión y sin cookies. Si la base no responde: 503 con el cuerpo de error genérico, sin detalle.
export function registerHealthRoutes(app: FastifyInstance, db: DatabaseSync): void {
  app.get('/health', async (request, reply) => {
    try {
      db.prepare('SELECT 1 AS x').get();
      return { status: 'ok' };
    } catch (error) {
      request.log.error({ err: error, correlationId: request.id }, 'health: la base no responde');
      const body: ErrorBody = { error: { code: 'INTERNAL_ERROR', correlationId: request.id } };
      return reply.code(503).send(body);
    }
  });
}
