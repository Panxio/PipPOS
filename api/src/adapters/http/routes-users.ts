import { AcceptInvitationSchema, CreateUserSchema, UpdateUserSchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../application/errors';
import type { AcceptInvitation } from '../../application/accept-invitation';
import type { CreateUser, ListUsers, UpdateUser, ReissueInvitation, ListMailbox } from '../../application/users';
import { SESSION_COOKIE } from './routes-auth';

export interface UserUseCases {
  list: ListUsers;
  create: CreateUser;
  update: UpdateUser;
  reissue: ReissueInvitation;
  mailbox: ListMailbox;
  accept: AcceptInvitation;
}

// Las rutas validan la forma del cuerpo y llaman al caso de uso; las reglas viven en application/ y domain/.
export function registerUserRoutes(app: FastifyInstance, casos: UserUseCases): void {
  app.get('/api/v1/users', async (request) => ({ items: await casos.list.execute(request.cookies[SESSION_COOKIE]) }));

  app.post('/api/v1/users', async (request, reply) => {
    const cuerpo = CreateUserSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    reply.code(201);
    return casos.create.execute(request.cookies[SESSION_COOKIE], cuerpo.data);
  });

  app.patch<{ Params: { id: string } }>('/api/v1/users/:id', async (request) => {
    const cambios = UpdateUserSchema.safeParse(request.body);
    if (!cambios.success) throw new AppError('VALIDATION_ERROR');
    return casos.update.execute(request.cookies[SESSION_COOKIE], request.params.id, cambios.data);
  });

  app.post<{ Params: { id: string } }>('/api/v1/users/:id/invitation', async (request, reply) => {
    await casos.reissue.execute(request.cookies[SESSION_COOKIE], request.params.id);
    return reply.code(204).send();
  });

  app.get('/api/v1/mailbox', async (request) => ({ items: await casos.mailbox.execute(request.cookies[SESSION_COOKIE]) }));

  // Pública: sin cookie y sin sesión. No inicia sesión; el usuario entra después con su clave nueva.
  app.post('/api/v1/invitations/accept', async (request, reply) => {
    const cuerpo = AcceptInvitationSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    await casos.accept.execute(cuerpo.data.token, cuerpo.data.password);
    return reply.code(204).send();
  });
}
