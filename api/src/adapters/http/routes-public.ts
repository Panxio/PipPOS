import {
  CreateTransactionPublicSchema,
  CreateTransactionSchema,
  ListPublicTransactionsQuerySchema,
  ListTerminalsQuerySchema,
  SalesQuerySchema,
  SummaryQuerySchema,
} from '@pippos/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthenticateApiKey } from '../../application/api-keys';
import { AppError } from '../../application/errors';
import type { CreateTransaction, GetTransaction, ListPublicTransactions } from '../../application/transactions';
import type { GetTerminal } from '../../application/get-terminal';
import type { ListTerminals } from '../../application/list-terminals';
import type { SalesReport, SummaryReport } from '../../application/reports';
import type { UserRecord } from '../../application/ports';
import { alcancePermite } from '../../domain/apikey';
import { hashToken } from '../persistence/repositories';
import { construirOpenApi } from './openapi';

const BASE = '/public/v1';
export const PUBLIC_RATE_MAX_DEFECTO = 60;

export interface PublicUseCases {
  autenticar: AuthenticateApiKey;
  listTerminals: ListTerminals;
  getTerminal: GetTerminal;
  summary: SummaryReport;
  sales: SalesReport;
  listTransactions: ListPublicTransactions;
  getTransaction: GetTransaction;
  createTransaction: CreateTransaction;
}

// «Authorization: Bearer <llave>». Cualquier otra forma no da llave y la petición cae en 401.
function llaveDe(request: FastifyRequest): string | undefined {
  return /^bearer (\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
}

// El límite es por llave (hash de la presentada). Sin llave, por IP: no hay nada que agotar.
function claveDeLimite(request: FastifyRequest): string {
  const llave = llaveDe(request);
  return llave === undefined ? `ip:${request.ip}` : `llave:${hashToken(llave)}`;
}

// Autentica la llave y exige su alcance ANTES de mirar la consulta o el cuerpo.
async function usuarioDe(casos: PublicUseCases, request: FastifyRequest): Promise<UserRecord> {
  const { alcance, usuario } = await casos.autenticar.execute(llaveDe(request));
  if (!alcancePermite(alcance, request.method)) throw new AppError('FORBIDDEN');
  return usuario;
}

export interface PublicRouteOptions {
  rateMax: number;
}

// La API pública expone solo K4-K6 y su OpenAPI. Las rutas que no existen aquí responden 404 NOT_FOUND del manejador general.
export function registerPublicRoutes(app: FastifyInstance, casos: PublicUseCases, opciones: PublicRouteOptions): void {
  const limite = { config: { rateLimit: { max: opciones.rateMax, timeWindow: '1 minute', keyGenerator: claveDeLimite } } };
  const documento = construirOpenApi();

  app.get(`${BASE}/openapi.json`, async () => documento);

  app.get(`${BASE}/terminals`, limite, async (request) => {
    const usuario = await usuarioDe(casos, request);
    const consulta = ListTerminalsQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.listTerminals.execute(usuario, consulta.data);
  });

  app.get<{ Params: { id: string } }>(`${BASE}/terminals/:id`, limite, async (request) => {
    const usuario = await usuarioDe(casos, request);
    return casos.getTerminal.execute(usuario, request.params.id);
  });

  app.get(`${BASE}/reports/summary`, limite, async (request) => {
    const usuario = await usuarioDe(casos, request);
    const consulta = SummaryQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.summary.execute(usuario, consulta.data);
  });

  app.get(`${BASE}/reports/sales`, limite, async (request) => {
    const usuario = await usuarioDe(casos, request);
    const consulta = SalesQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.sales.execute(usuario, consulta.data);
  });

  app.get(`${BASE}/transactions`, limite, async (request) => {
    const usuario = await usuarioDe(casos, request);
    const consulta = ListPublicTransactionsQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.listTransactions.execute(usuario, consulta.data);
  });

  app.get<{ Params: { id: string } }>(`${BASE}/transactions/:id`, limite, async (request) => {
    const usuario = await usuarioDe(casos, request);
    return casos.getTransaction.execute(usuario, request.params.id);
  });

  // Cobrar: el alcance write se exige antes que el cuerpo. La clave de idempotencia es el requestId del cobro interno.
  app.post(`${BASE}/transactions`, limite, async (request, reply) => {
    const usuario = await usuarioDe(casos, request);
    const clave = CreateTransactionSchema.shape.requestId.safeParse(request.headers['idempotency-key']);
    if (!clave.success) throw new AppError('VALIDATION_ERROR');
    const cuerpo = CreateTransactionPublicSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    const resultado = await casos.createTransaction.execute(usuario, { ...cuerpo.data, requestId: clave.data });
    reply.code(resultado.creada ? 201 : 200);
    return resultado.transaccion;
  });
}
