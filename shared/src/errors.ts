import { z } from 'zod';

export const ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'ORIGIN_NOT_ALLOWED',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
  'ACCOUNT_LOCKED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorBody = { error: { code: ErrorCode; correlationId: string } };

// Forma de todo error de la API (la usa la especificación OpenAPI de la API pública).
export const ErrorBodySchema = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), correlationId: z.string() }),
});
