import { z } from 'zod';
import { MILISEGUNDOS } from './transactions';

// Bitácora: las acciones que se registran. Cobrar, leer o marcar alertas no están aquí.
export const AUDIT_ACTIONS = [
  'auth.login', 'auth.login_failed', 'user.created', 'user.updated', 'user.password_changed',
  'terminal.created', 'terminal.updated', 'terminal.imported',
  'apikey.created', 'apikey.revoked', 'apikey.rotated',
  'transaction.voided', 'transaction.refunded', 'alert_settings.updated',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// Filtros compartidos por la lista y la exportación (A9-A10). Desde y hasta son milisegundos inclusivos.
const FILTROS_AUDITORIA = {
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorId: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  from: z
    .string()
    .regex(MILISEGUNDOS)
    .transform((valor) => Number(valor))
    .optional(),
  to: z
    .string()
    .regex(MILISEGUNDOS)
    .transform((valor) => Number(valor))
    .optional(),
};

// La exportación no pagina: page, pageSize y cualquier otro parámetro son un error (400).
export const ExportAuditQuerySchema = z.object(FILTROS_AUDITORIA).strict();
export type ExportAuditQuery = z.infer<typeof ExportAuditQuerySchema>;

export const ListAuditQuerySchema = z
  .object({
    ...FILTROS_AUDITORIA,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ListAuditQuery = z.infer<typeof ListAuditQuerySchema>;

export const AuditEntrySchema = z.object({
  seq: z.number().int(),
  atMs: z.number().int(),
  actorId: z.string().nullable(),
  actorName: z.string(),
  action: z.enum(AUDIT_ACTIONS),
  entityType: z.string(),
  entityId: z.string().nullable(),
  detail: z.record(z.string(), z.string()),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const AuditPageSchema = z.object({
  items: z.array(AuditEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AuditPage = z.infer<typeof AuditPageSchema>;
