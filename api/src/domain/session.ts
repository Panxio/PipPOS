export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// Activa estrictamente antes del vencimiento (spec S6).
export function isSessionActive(expiresAtMs: number, nowMs: number): boolean {
  return nowMs < expiresAtMs;
}
