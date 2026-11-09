import type { DatabaseSync } from 'node:sqlite';
import { AdvanceClockSchema, InjectTransactionSchema, TelemetrySchema } from '@pippos/shared';
import type { FastifyInstance } from 'fastify';
import type { InjectTelemetry } from '../../application/alerts';
import { AppError } from '../../application/errors';
import type { PasswordHasher } from '../../application/ports';
import type { InjectTransaction } from '../../application/transactions';
import { seedDemo } from '../../seed/demo';
import { resetDb } from '../persistence/sqlite';

// Reloj que las pruebas pueden mover: el real es OffsetClock.
export interface TestClock {
  advance(ms: number): void;
  reset(): void;
}

export interface TestRouteDeps {
  db: DatabaseSync;
  hasher: PasswordHasher;
  clock?: TestClock;
  inyectarTransaccion: InjectTransaction;
  telemetria: InjectTelemetry;
}

// Solo se registran con ENABLE_TEST_ROUTES=1; sin la flag la ruta no existe y responde 404 NOT_FOUND.
export function registerTestRoutes(app: FastifyInstance, deps: TestRouteDeps): void {
  app.post('/__test__/reset', async (_request, reply) => {
    resetDb(deps.db);
    await seedDemo(deps.db, deps.hasher);
    deps.clock?.reset();
    return reply.code(204).send();
  });

  app.post('/__test__/seed', async (_request, reply) => {
    await seedDemo(deps.db, deps.hasher);
    return reply.code(204).send();
  });

  // Puebla el feed y los filtros sin pasar por el switch (C11).
  app.post('/__test__/transactions', async (request, reply) => {
    const cuerpo = InjectTransactionSchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    const transaccion = await deps.inyectarTransaccion.execute(cuerpo.data);
    return reply.code(201).send(transaccion);
  });

  // Telemetría simulada: conexión y batería de un terminal, sin pasar por el terminal real.
  app.post<{ Params: { id: string } }>('/__test__/terminals/:id/telemetry', async (request) => {
    const cuerpo = TelemetrySchema.safeParse(request.body);
    if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
    return deps.telemetria.execute(request.params.id, cuerpo.data);
  });

  if (deps.clock) {
    const clock = deps.clock;
    app.post('/__test__/clock', async (request, reply) => {
      const cuerpo = AdvanceClockSchema.safeParse(request.body);
      if (!cuerpo.success) throw new AppError('VALIDATION_ERROR');
      clock.advance(cuerpo.data.advanceMs);
      return reply.code(204).send();
    });
  }
}
