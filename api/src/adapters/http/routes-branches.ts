import { CreateBranchSchema, CreateTillSchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../application/errors';
import type { CreateBranch, CreateTill, ListBranches } from '../../application/branches';
import { SESSION_COOKIE } from './routes-auth';

export interface BranchUseCases {
  list: ListBranches;
  create: CreateBranch;
  createTill: CreateTill;
}

// Las rutas validan la forma del cuerpo y llaman al caso de uso; las reglas viven en application/ y domain/.
export function registerBranchRoutes(app: FastifyInstance, casos: BranchUseCases): void {
  app.get('/api/v1/branches', async (request) => ({ items: await casos.list.execute(request.cookies[SESSION_COOKIE]) }));

  app.post('/api/v1/branches', async (request, reply) => {
    const cuerpo = CreateBranchSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    reply.code(201);
    return casos.create.execute(request.cookies[SESSION_COOKIE], cuerpo.data.name);
  });

  app.post<{ Params: { id: string } }>('/api/v1/branches/:id/tills', async (request, reply) => {
    const cuerpo = CreateTillSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    reply.code(201);
    return casos.createTill.execute(request.cookies[SESSION_COOKIE], request.params.id, cuerpo.data.name);
  });
}
