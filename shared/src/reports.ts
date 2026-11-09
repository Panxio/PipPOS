import { z } from 'zod';

// Reportería del comercio (R2, R4, R5, R7). Importes en unidad mínima como texto decimal; conteos y puntos base como número.

export const REPORT_GROUP_BY = ['day', 'hour', 'terminal', 'cashier', 'method', 'brand'] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BY)[number];

// Ventana máxima de una consulta: 366 días completos en milisegundos.
export const MAX_REPORT_RANGE_MS = 366 * 86_400_000;

const MILISEGUNDOS = /^[0-9]{1,15}$/;
const DESFASE_TEXTO = /^-?[0-9]{1,4}$/;

// Campos comunes a todos los reportes: los tres son obligatorios y se convierten de texto a número.
const CAMPOS_RANGO = {
  from: z.string().regex(MILISEGUNDOS).transform((valor) => Number(valor)),
  to: z.string().regex(MILISEGUNDOS).transform((valor) => Number(valor)),
  // Minutos al este de UTC, fijos en todo el rango: lo manda el navegador.
  tzOffsetMin: z
    .string()
    .regex(DESFASE_TEXTO)
    .transform((valor) => Number(valor))
    .pipe(z.number().int().min(-720).max(840)),
};

// R2: desde ≤ hasta y como mucho 366 días completos.
function rangoValido(consulta: { from: number; to: number }): boolean {
  return consulta.from <= consulta.to && consulta.to - consulta.from + 1 <= MAX_REPORT_RANGE_MS;
}

export const SummaryQuerySchema = z
  .object({
    ...CAMPOS_RANGO,
    compare: z
      .enum(['true', 'false'])
      .optional()
      .transform((valor) => valor === 'true'),
  })
  .strict()
  .refine(rangoValido);
export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;

export const SalesQuerySchema = z
  .object({
    ...CAMPOS_RANGO,
    groupBy: z.enum(REPORT_GROUP_BY),
  })
  .strict()
  .refine(rangoValido);
export type SalesQuery = z.infer<typeof SalesQuerySchema>;

export const ReportRangeSchema = z.object({ from: z.number().int(), to: z.number().int() });
export type ReportRange = z.infer<typeof ReportRangeSchema>;

export const ReportKpisSchema = z.object({
  totalNet: z.string(),
  sales: z.number().int().nonnegative(),
  avgTicket: z.string(),
  attempts: z.number().int().nonnegative(),
  approvalBp: z.number().int().nonnegative(),
  voidedCount: z.number().int().nonnegative(),
  voidedAmount: z.string(),
});
export type ReportKpis = z.infer<typeof ReportKpisSchema>;

export const SummaryResponseSchema = z.object({
  range: ReportRangeSchema,
  kpis: ReportKpisSchema,
  previous: z.object({ range: ReportRangeSchema, kpis: ReportKpisSchema }).optional(),
});
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

export const SalesItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  sales: z.number().int().nonnegative(),
  totalNet: z.string(),
});
export type SalesItem = z.infer<typeof SalesItemSchema>;

export const SalesResponseSchema = z.object({
  groupBy: z.enum(REPORT_GROUP_BY),
  items: z.array(SalesItemSchema),
});
export type SalesResponse = z.infer<typeof SalesResponseSchema>;
