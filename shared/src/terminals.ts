import { z } from 'zod';

export const TERMINAL_STATUSES = ['active', 'inactive'] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export const TERMINAL_CONNECTIONS = ['online', 'offline'] as const;
export type TerminalConnection = (typeof TERMINAL_CONNECTIONS)[number];

export const TERMINAL_SORT_FIELDS = ['serial', 'alias', 'branch', 'createdAt'] as const;
export type TerminalSortField = (typeof TERMINAL_SORT_FIELDS)[number];

export const IMPORT_ROW_CODES = [
  'INVALID_SERIAL',
  'DUPLICATE_SERIAL',
  'MISSING_FIELD',
  'INVALID_FIELD',
  'UNSAFE_VALUE',
] as const;
export type ImportRowCode = (typeof IMPORT_ROW_CODES)[number];

export const TerminalSchema = z.object({
  id: z.string(),
  serial: z.string(),
  alias: z.string(),
  model: z.string(),
  branch: z.string(),
  till: z.string(),
  status: z.enum(TERMINAL_STATUSES),
  firmware: z.string(),
  batteryPct: z.number().int(),
  connection: z.enum(TERMINAL_CONNECTIONS),
  createdAt: z.number().int(),
});
export type Terminal = z.infer<typeof TerminalSchema>;

export const CreateTerminalSchema = z
  .object({
    serial: z.string(),
    alias: z.string(),
    model: z.string(),
    branch: z.string(),
    till: z.string(),
  })
  .strict();
export type CreateTerminalInput = z.infer<typeof CreateTerminalSchema>;

export const UpdateTerminalSchema = z
  .object({
    alias: z.string().optional(),
    branch: z.string().optional(),
    till: z.string().optional(),
    status: z.enum(TERMINAL_STATUSES).optional(),
  })
  .strict()
  .refine((cambios) => Object.keys(cambios).length > 0, { message: 'al menos un campo' });
export type UpdateTerminalInput = z.infer<typeof UpdateTerminalSchema>;

export const ListTerminalsQuerySchema = z.object({
  status: z.enum(TERMINAL_STATUSES).optional(),
  q: z.string().max(60).optional(),
  sort: z.enum(TERMINAL_SORT_FIELDS).default('serial'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListTerminalsQuery = z.infer<typeof ListTerminalsQuerySchema>;

export const TerminalPageSchema = z.object({
  items: z.array(TerminalSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type TerminalPage = z.infer<typeof TerminalPageSchema>;

export const ImportCsvBodySchema = z.string();

export const ImportResultSchema = z.object({
  created: z.number().int().nonnegative(),
  invalid: z.array(z.object({ row: z.number().int().positive(), code: z.enum(IMPORT_ROW_CODES) })),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;
