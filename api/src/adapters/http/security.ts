import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { ErrorBody, ErrorCode } from '@pippos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../application/errors';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ORIGIN_NOT_ALLOWED: 403,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ACCOUNT_LOCKED: 423,
  INTERNAL_ERROR: 500,
};

const METHODS_WITH_EFFECT = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Propuesta de la spec S5: 5 peticiones de login por minuto y por IP (sin confiar en X-Forwarded-For).
// LOGIN_RATE_MAX lo cambia; las pruebas lo suben para no chocar con el límite.
export const LOGIN_RATE_MAX_DEFECTO = 5;

export function limiteDeLogin(max: number = LOGIN_RATE_MAX_DEFECTO) {
  return { max, timeWindow: '1 minute' } as const;
}

interface Clasificacion {
  code: ErrorCode;
  status: number;
}

export function sendError(reply: FastifyReply, status: number, code: ErrorCode, correlationId: string): FastifyReply {
  const body: ErrorBody = { error: { code, correlationId } };
  return reply.code(status).send(body);
}

function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

// Traduce cualquier error a un código de negocio: lo no previsto es INTERNAL_ERROR, sin detalle.
function classify(error: unknown): Clasificacion {
  if (error instanceof AppError) return { code: error.code, status: STATUS_BY_CODE[error.code] };
  const status = statusCodeOf(error);
  if (status === 404) return { code: 'NOT_FOUND', status };
  if (status !== undefined && status >= 400 && status < 500) return { code: 'VALIDATION_ERROR', status };
  return { code: 'INTERNAL_ERROR', status: STATUS_BY_CODE.INTERNAL_ERROR };
}

// Hook de origen: en peticiones con efecto, un Origin presente y ajeno se rechaza. Sin Origin pasa.
function originGuard(allowedOrigins: readonly string[]) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!METHODS_WITH_EFFECT.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin)) throw new AppError('ORIGIN_NOT_ALLOWED');
  };
}

// Registra en la raíz: manejadores de error y 404, cabeceras (helmet), límite de login y hook de origen.
// Debe llamarse antes de registrar las rutas (los hooks y el límite se heredan a los contextos hijos).
export function registerSecurity(app: FastifyInstance, allowedOrigins: readonly string[]): void {
  app.setErrorHandler((error: unknown, request, reply) => {
    const { code, status } = classify(error);
    if (code === 'INTERNAL_ERROR') request.log.error({ err: error, correlationId: request.id }, 'error no controlado');
    return sendError(reply, status, code, request.id);
  });
  app.setNotFoundHandler((request, reply) => sendError(reply, 404, 'NOT_FOUND', request.id));
  app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], upgradeInsecureRequests: null } },
  });
  app.register(rateLimit, { global: false, errorResponseBuilder: () => new AppError('RATE_LIMITED') });
  app.addHook('onRequest', originGuard(allowedOrigins));
}
