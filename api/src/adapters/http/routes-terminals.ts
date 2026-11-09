import { CreateTerminalSchema, ImportCsvBodySchema, ListTerminalsQuerySchema, UpdateTerminalSchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../application/errors';
import type { CreateTerminal } from '../../application/create-terminal';
import type { GetTerminal } from '../../application/get-terminal';
import type { ImportTerminals } from '../../application/import-terminals';
import type { ListTerminals } from '../../application/list-terminals';
import type { UpdateTerminal } from '../../application/update-terminal';
import { SESSION_COOKIE } from './routes-auth';

const BASE = '/api/v1/terminals';
const LIMITE_CUERPO_CSV = 1024 * 1024;

export interface TerminalUseCases {
  list: ListTerminals;
  get: GetTerminal;
  create: CreateTerminal;
  update: UpdateTerminal;
  importCsv: ImportTerminals;
}

// Las rutas validan la forma del cuerpo y llaman al caso de uso; las reglas viven en application/ y domain/.
export function registerTerminalRoutes(app: FastifyInstance, casos: TerminalUseCases): void {
  app.addContentTypeParser('text/csv', { parseAs: 'string', bodyLimit: LIMITE_CUERPO_CSV }, (_request, cuerpo, hecho) =>
    hecho(null, cuerpo),
  );

  app.get(BASE, async (request) => {
    const consulta = ListTerminalsQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.list.execute(request.cookies[SESSION_COOKIE], consulta.data);
  });

  app.get<{ Params: { id: string } }>(`${BASE}/:id`, async (request) =>
    casos.get.execute(request.cookies[SESSION_COOKIE], request.params.id),
  );

  app.post(BASE, async (request, reply) => {
    const cuerpo = CreateTerminalSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    reply.code(201);
    return casos.create.execute(request.cookies[SESSION_COOKIE], cuerpo.data);
  });

  app.post(`${BASE}/import`, async (request) => {
    const csv = ImportCsvBodySchema.safeParse(request.body);
    if (!csv.success) throw new AppError('VALIDATION_ERROR');
    return casos.importCsv.execute(request.cookies[SESSION_COOKIE], csv.data);
  });

  app.patch<{ Params: { id: string } }>(`${BASE}/:id`, async (request) => {
    const cambios = UpdateTerminalSchema.safeParse(request.body);
    if (!cambios.success) throw new AppError('VALIDATION_ERROR');
    return casos.update.execute(request.cookies[SESSION_COOKIE], request.params.id, cambios.data);
  });
}
