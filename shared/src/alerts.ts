import { z } from 'zod';
import { IMPORTE } from './transactions';

// Alertas. El front traduce los textos: la API solo manda tipo y parámetros.
export const ALERT_TYPES = ['terminal_offline', 'battery_low', 'void_over_threshold'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

// Umbrales del comercio (A2): batería por debajo de un porcentaje y anulación desde un importe (texto decimal).
export const AlertSettingsSchema = z
  .object({
    batteryBelowPct: z.number().int().min(1).max(99),
    voidAtLeastAmount: z.string().regex(IMPORTE),
  })
  .strict();
export type AlertSettings = z.infer<typeof AlertSettingsSchema>;

// Consulta de la lista (A5): unread=true|false y limit 1-100. Lo desconocido es un error.
export const ListAlertsQuerySchema = z
  .object({
    unread: z
      .enum(['true', 'false'])
      .default('false')
      .transform((valor) => valor === 'true'),
    limit: z
      .string()
      .regex(/^[0-9]{1,3}$/)
      .transform((valor) => Number(valor))
      .pipe(z.number().int().min(1).max(100))
      .default(50),
  })
  .strict();
export type ListAlertsQuery = z.infer<typeof ListAlertsQuerySchema>;

export const AlertSchema = z.object({
  id: z.string(),
  type: z.enum(ALERT_TYPES),
  createdAt: z.number().int(),
  resolvedAt: z.number().int().nullable(),
  read: z.boolean(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type Alert = z.infer<typeof AlertSchema>;

export const AlertListSchema = z.object({
  items: z.array(AlertSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type AlertList = z.infer<typeof AlertListSchema>;
