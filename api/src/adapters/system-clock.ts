import type { Clock } from '../application/ports';

// Reloj real: el único punto del código que lee la hora del sistema.
export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }
}
