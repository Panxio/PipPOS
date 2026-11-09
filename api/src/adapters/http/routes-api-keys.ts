import { CreateApiKeySchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import type { CreateApiKey, ListApiKeys, RevokeApiKey, RotateApiKey } from '../../application/api-keys';
import { AppError } from '../../application/errors';
import { SESSION_COOKIE } from './routes-auth';

const BASE = '/api/v1/api-keys';

export interface ApiKeyUseCases {
  create: CreateApiKey;
  list: ListApiKeys;
  revoke: RevokeApiKey;
  rotate: RotateApiKey;
}

// Gestión de llaves: va con cookie de sesión, solo para el admin (lo exige el caso de uso).
export function registerApiKeyRoutes(app: FastifyInstance, casos: ApiKeyUseCases): void {
  app.post(BASE, async (request, reply) => {
    const cuerpo = CreateApiKeySchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    reply.code(201);
    return casos.create.execute(request.cookies[SESSION_COOKIE], cuerpo.data);
  });

  app.get(BASE, async (request) => casos.list.execute(request.cookies[SESSION_COOKIE]));

  app.post<{ Params: { id: string } }>(`${BASE}/:id/revoke`, async (request) =>
    casos.revoke.execute(request.cookies[SESSION_COOKIE], request.params.id),
  );

  app.post<{ Params: { id: string } }>(`${BASE}/:id/rotate`, async (request, reply) => {
    reply.code(201);
    return casos.rotate.execute(request.cookies[SESSION_COOKIE], request.params.id);
  });
}
