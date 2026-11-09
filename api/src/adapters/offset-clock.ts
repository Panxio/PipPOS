import type { Clock } from '../application/ports';

// Reloj de la aplicación: la hora del sistema más un desfase que solo mueven las rutas de prueba.
// En producción el desfase queda en 0 y se comporta como SystemClock.
export class OffsetClock implements Clock {
  private desfaseMs = 0;

  nowMs(): number {
    return Date.now() + this.desfaseMs;
  }

  advance(ms: number): void {
    this.desfaseMs += ms;
  }

  reset(): void {
    this.desfaseMs = 0;
  }
}
