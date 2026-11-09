import {
  CreateTransactionSchema,
  ListTransactionsQuerySchema,
  RefundTransactionSchema,
  VoidTransactionSchema,
} from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../application/errors';
import type {
  CreateTransaction,
  GetReceipt,
  GetTransaction,
  ListTransactions,
  RefundTransaction,
  VoidTransaction,
} from '../../application/transactions';
import { SESSION_COOKIE } from './routes-auth';

const BASE = '/api/v1/transactions';

export interface TransactionUseCases {
  create: CreateTransaction;
  list: ListTransactions;
  get: GetTransaction;
  void: VoidTransaction;
  refund: RefundTransaction;
  receipt: GetReceipt;
}

// Las rutas validan la forma del cuerpo y llaman al caso de uso; las reglas viven en application/ y domain/.
export function registerTransactionRoutes(app: FastifyInstance, casos: TransactionUseCases): void {
  app.post(BASE, async (request, reply) => {
    const cuerpo = CreateTransactionSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    const resultado = await casos.create.execute(request.cookies[SESSION_COOKIE], cuerpo.data);
    reply.code(resultado.creada ? 201 : 200);
    return resultado.transaccion;
  });

  app.get(BASE, async (request) => {
    const consulta = ListTransactionsQuerySchema.safeParse(request.query);
    if (!consulta.success) throw new AppError('VALIDATION_ERROR');
    return casos.list.execute(request.cookies[SESSION_COOKIE], consulta.data);
  });

  app.get<{ Params: { id: string } }>(`${BASE}/:id`, async (request) =>
    casos.get.execute(request.cookies[SESSION_COOKIE], request.params.id),
  );

  app.get<{ Params: { id: string } }>(`${BASE}/:id/receipt`, async (request) =>
    casos.receipt.execute(request.cookies[SESSION_COOKIE], request.params.id),
  );

  app.post<{ Params: { id: string } }>(`${BASE}/:id/void`, async (request) => {
    const cuerpo = VoidTransactionSchema.safeParse(request.body ?? {});
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    return casos.void.execute(request.cookies[SESSION_COOKIE], request.params.id);
  });

  app.post<{ Params: { id: string } }>(`${BASE}/:id/refund`, async (request) => {
    const cuerpo = RefundTransactionSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    return casos.refund.execute(request.cookies[SESSION_COOKIE], request.params.id, cuerpo.data);
  });
}
