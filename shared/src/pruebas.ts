import { z } from 'zod';
import { TERMINAL_CONNECTIONS } from './terminals';

// Solo para las rutas de prueba (ENABLE_TEST_ROUTES=1): avanzar el reloj del servidor.
export const ADVANCE_CLOCK_MAX_MS = 2_592_000_000; // 30 días

export const AdvanceClockSchema = z
  .object({ advanceMs: z.number().int().min(0).max(ADVANCE_CLOCK_MAX_MS) })
  .strict();
export type AdvanceClockInput = z.infer<typeof AdvanceClockSchema>;

// Solo para las rutas de prueba: la telemetría que en producción llegaría del terminal. Al menos un campo.
export const TelemetrySchema = z
  .object({
    connection: z.enum(TERMINAL_CONNECTIONS).optional(),
    batteryPct: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine((cambios) => Object.keys(cambios).length > 0, { message: 'al menos un campo' });
export type TelemetryInput = z.infer<typeof TelemetrySchema>;
